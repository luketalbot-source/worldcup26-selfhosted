import { useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Match } from '@/types/match';
import { groupStageMatches } from '@/data/matches';
import { getAllKnockoutMatches, KnockoutMatch } from '@/data/knockoutMatches';

// Global cooldown in seconds
const SYNC_COOLDOWN_SECONDS = 60;

interface LiveMatch {
  id: string;
  match_id: string;
  home_team_name: string;
  home_team_code: string;
  away_team_name: string;
  away_team_code: string;
  home_score: number | null;
  away_score: number | null;
  match_date: string;
  venue: string | null;
  city: string | null;
  stage: string;
  group_name: string | null;
  status: string;
  last_updated: string;
}

export const useLiveMatches = () => {
  const [liveMatches, setLiveMatches] = useState<LiveMatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastSync, setLastSync] = useState<Date | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [cooldownRemaining, setCooldownRemaining] = useState(0);
  const hasAutoSynced = useRef(false);

  const fetchLiveMatches = useCallback(async () => {
    const { data, error } = await supabase
      .from('live_matches')
      .select('*')
      .order('match_date', { ascending: true });

    if (!error && data) {
      setLiveMatches(data);
      if (data.length > 0) {
        // Get the most recent last_updated timestamp
        const mostRecent = data.reduce((latest, match) => {
          const matchDate = new Date(match.last_updated);
          return matchDate > latest ? matchDate : latest;
        }, new Date(0));
        setLastSync(mostRecent);
        return mostRecent;
      }
    }
    setLoading(false);
    return null;
  }, []);

  // Check if sync is allowed based on global cooldown
  const canSync = useCallback(() => {
    if (!lastSync) return true;
    const secondsSinceSync = (Date.now() - lastSync.getTime()) / 1000;
    return secondsSinceSync >= SYNC_COOLDOWN_SECONDS;
  }, [lastSync]);

  // Update cooldown remaining timer
  useEffect(() => {
    if (!lastSync) {
      setCooldownRemaining(0);
      return;
    }

    const updateCooldown = () => {
      const secondsSinceSync = (Date.now() - lastSync.getTime()) / 1000;
      const remaining = Math.max(0, SYNC_COOLDOWN_SECONDS - secondsSinceSync);
      setCooldownRemaining(Math.ceil(remaining));
    };

    updateCooldown();
    const interval = setInterval(updateCooldown, 1000);
    return () => clearInterval(interval);
  }, [lastSync]);

  const syncMatches = useCallback(async (force = false) => {
    // Check cooldown unless forced
    if (!force && !canSync()) {
      console.log(`Sync on cooldown. ${cooldownRemaining}s remaining.`);
      return { skipped: true, reason: 'cooldown' };
    }

    setSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke('sync-matches');
      
      if (error) {
        console.error('Error syncing matches:', error);
        return { success: false, error };
      } else {
        console.log('Sync result:', data);
        // Refresh local data after sync
        await fetchLiveMatches();
        return { success: true, data };
      }
    } catch (err) {
      console.error('Failed to sync:', err);
      return { success: false, error: err };
    } finally {
      setSyncing(false);
    }
  }, [fetchLiveMatches, canSync, cooldownRemaining]);

  // Auto-sync on app open (once per mount, respecting cooldown)
  useEffect(() => {
    const initializeAndSync = async () => {
      // First, fetch current data to get the last sync time
      const lastSyncTime = await fetchLiveMatches();
      setLoading(false);
      
      // Only auto-sync once per app session
      if (hasAutoSynced.current) return;
      hasAutoSynced.current = true;

      // Check if we should auto-sync based on last sync time
      if (!lastSyncTime) {
        // No data yet, sync immediately
        console.log('No data found, syncing...');
        await syncMatches(true);
      } else {
        const secondsSinceSync = (Date.now() - lastSyncTime.getTime()) / 1000;
        if (secondsSinceSync >= SYNC_COOLDOWN_SECONDS) {
          console.log(`Last sync was ${Math.floor(secondsSinceSync)}s ago, auto-syncing...`);
          await syncMatches(true);
        } else {
          console.log(`Last sync was ${Math.floor(secondsSinceSync)}s ago, within cooldown.`);
        }
      }
    };

    initializeAndSync();
  }, []);

  // Merge live data with local static data
  const mergeWithLocalData = useCallback((localMatches: Match[]): Match[] => {
    return localMatches.map(match => {
      // Find matching live data by comparing team codes
      const liveMatch = liveMatches.find(lm => {
        // Match by our local match_id or by team codes
        if (lm.match_id === match.id) return true;
        
        // Try to match by teams
        const homeMatches = lm.home_team_code === match.homeTeam.code;
        const awayMatches = lm.away_team_code === match.awayTeam.code;
        return homeMatches && awayMatches;
      });

      if (liveMatch) {
        return {
          ...match,
          homeScore: liveMatch.home_score ?? undefined,
          awayScore: liveMatch.away_score ?? undefined,
          status: mapApiStatus(liveMatch.status),
        };
      }

      return match;
    });
  }, [liveMatches]);

  const getTodayMatches = useCallback((): Match[] => {
    const today = new Date();
    const todayStr = today.toLocaleDateString('en-US', { 
      month: 'long', 
      day: 'numeric', 
      year: 'numeric' 
    });
    
    const todayMatches = groupStageMatches.filter(match => {
      // Parse match date and compare with today
      const matchDate = new Date(match.date);
      const matchDateStr = matchDate.toLocaleDateString('en-US', { 
        month: 'long', 
        day: 'numeric', 
        year: 'numeric' 
      });
      return matchDateStr === todayStr;
    });
    
    return mergeWithLocalData(todayMatches);
  }, [mergeWithLocalData]);

  const getGroupMatches = useCallback((group: string): Match[] => {
    const localMatches = groupStageMatches.filter(m => m.group === group);
    return mergeWithLocalData(localMatches);
  }, [mergeWithLocalData]);

  const getKnockoutMatches = useCallback((stage: string): KnockoutMatch[] => {
    const allKnockout = getAllKnockoutMatches();
    const stageMatches = allKnockout.filter(m => m.stage === stage);
    
    return stageMatches.map(match => {
      const liveMatch = liveMatches.find(lm => {
        if (lm.match_id === match.id) return true;
        return lm.stage === match.stage;
      });

      if (liveMatch) {
        return {
          ...match,
          homeTeam: {
            ...match.homeTeam,
            name: liveMatch.home_team_name || match.homeTeam.name,
            code: liveMatch.home_team_code || match.homeTeam.code,
          },
          awayTeam: {
            ...match.awayTeam,
            name: liveMatch.away_team_name || match.awayTeam.name,
            code: liveMatch.away_team_code || match.awayTeam.code,
          },
          homeScore: liveMatch.home_score ?? undefined,
          awayScore: liveMatch.away_score ?? undefined,
          status: mapApiStatus(liveMatch.status),
        };
      }

      return match;
    });
  }, [liveMatches]);

  return {
    liveMatches,
    loading,
    lastSync,
    syncing,
    syncMatches,
    canSync,
    cooldownRemaining,
    getGroupMatches,
    getKnockoutMatches,
    getTodayMatches,
    refetch: fetchLiveMatches,
  };
};

function mapApiStatus(apiStatus: string): 'upcoming' | 'live' | 'finished' {
  switch (apiStatus) {
    case 'FINISHED':
      return 'finished';
    case 'IN_PLAY':
    case 'PAUSED':
    case 'LIVE':
      return 'live';
    case 'SCHEDULED':
    case 'TIMED':
    default:
      return 'upcoming';
  }
}
