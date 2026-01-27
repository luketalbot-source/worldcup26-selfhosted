import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Match } from '@/types/match';
import { groupStageMatches } from '@/data/matches';
import { getAllKnockoutMatches, KnockoutMatch } from '@/data/knockoutMatches';

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

  const fetchLiveMatches = useCallback(async () => {
    const { data, error } = await supabase
      .from('live_matches')
      .select('*')
      .order('match_date', { ascending: true });

    if (!error && data) {
      setLiveMatches(data);
      if (data.length > 0) {
        setLastSync(new Date(data[0].last_updated));
      }
    }
    setLoading(false);
  }, []);

  const syncMatches = useCallback(async () => {
    setSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke('sync-matches');
      
      if (error) {
        console.error('Error syncing matches:', error);
      } else {
        console.log('Sync result:', data);
        // Refresh local data after sync
        await fetchLiveMatches();
      }
    } catch (err) {
      console.error('Failed to sync:', err);
    } finally {
      setSyncing(false);
    }
  }, [fetchLiveMatches]);

  useEffect(() => {
    fetchLiveMatches();
  }, [fetchLiveMatches]);

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
    getGroupMatches,
    getKnockoutMatches,
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
