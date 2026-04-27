import { useEffect, useState, useCallback, useRef } from 'react';
import { api, ApiError } from '@/lib/apiClient';
import { Match, Team } from '@/types/match';
import { groupStageMatches } from '@/data/matches';
import { getAllKnockoutMatches, KnockoutMatch } from '@/data/knockoutMatches';
import { useTeams } from './useTeams';

// Global cooldown in seconds
const SYNC_COOLDOWN_SECONDS = 60;

// Same-origin SSE endpoint. EventSource doesn't support custom headers so
// we couldn't auth this with our Bearer token anyway; the stream is open
// to read access (matches the public GET /api/matches contract).
const STREAM_URL = (import.meta.env.VITE_API_URL as string | undefined ?? '/api') + '/matches/stream';

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
  const { getTeamByCode } = useTeams();
  const [liveMatches, setLiveMatches] = useState<LiveMatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastSync, setLastSync] = useState<Date | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [cooldownRemaining, setCooldownRemaining] = useState(0);
  const hasAutoSynced = useRef(false);

  const fetchLiveMatches = useCallback(async () => {
    try {
      const data = await api.get<LiveMatch[]>('/matches');
      if (data) {
        const sorted = [...data].sort((a, b) =>
          new Date(a.match_date).getTime() - new Date(b.match_date).getTime()
        );
        setLiveMatches(sorted);
        if (sorted.length > 0) {
          const mostRecent = sorted.reduce((latest, match) => {
            const matchDate = new Date(match.last_updated);
            return matchDate > latest ? matchDate : latest;
          }, new Date(0));
          setLastSync(mostRecent);
          return mostRecent;
        }
      }
    } catch (err) {
      console.error('Error fetching live matches:', err);
    } finally {
      setLoading(false);
    }
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
      const data = await api.post('/admin/sync-matches');
      await fetchLiveMatches();
      return { success: true, data };
    } catch (err) {
      // 403 happens for unauthenticated requests against the sync route — a
      // benign failure when called automatically (e.g. by the matches view's
      // initial useEffect for a logged-out viewer). Log it as a debug-level
      // signal rather than a console.error stack trace.
      const isForbidden = err instanceof ApiError && err.status === 403;
      if (isForbidden) {
        console.debug('[sync-matches] forbidden — skipping (likely unauthenticated)');
      } else {
        console.error('Failed to sync:', err);
      }
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

  // Live push: subscribe to the SSE stream so admin overrides and FD-driven
  // sync updates appear in this hook's state without waiting for a refetch.
  // Critical for live matches — users should see goals as soon as the score
  // hits the DB, not on the next page reload.
  useEffect(() => {
    const es = new EventSource(STREAM_URL);

    es.addEventListener('match-update', (ev) => {
      try {
        const incoming = JSON.parse((ev as MessageEvent).data) as LiveMatch;
        setLiveMatches((rows) => {
          const idx = rows.findIndex((r) => r.match_id === incoming.match_id);
          if (idx === -1) {
            // New row (e.g. a fixture only just appeared in FD's feed).
            // Re-sort so the new row lands in chronological order.
            const next = [...rows, incoming];
            next.sort((a, b) =>
              new Date(a.match_date).getTime() - new Date(b.match_date).getTime()
            );
            return next;
          }
          const next = [...rows];
          next[idx] = incoming;
          return next;
        });
        // Bump lastSync so the cooldown timer reflects the most recent
        // server-side write — otherwise the user might smash the manual
        // sync button right after a goal lands via push.
        setLastSync(new Date(incoming.last_updated));
      } catch (err) {
        console.error('[match-stream] failed to parse event:', err);
      }
    });

    es.addEventListener('error', () => {
      // EventSource auto-reconnects on transient errors. Just log so we
      // notice if the endpoint is genuinely down. readyState === CLOSED
      // (2) means the browser gave up — usually CORS / 404 / wrong origin.
      if (es.readyState === EventSource.CLOSED) {
        console.warn('[match-stream] connection closed, will not retry');
      }
    });

    return () => {
      es.close();
    };
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

  // Today = matches whose kickoff falls on the user's local calendar day.
  // Pulls from `liveMatches` (live API data), not the static fixture file —
  // the static file's dates are all set to the actual tournament window
  // (June 2026), so it'd never include "today" outside the WC itself, and
  // would never reflect a freshly synced live match.
  const getTodayMatches = useCallback((): Match[] => {
    const fallbackTeam = (code: string, name: string, group: string | null): Team => ({
      id: code.toLowerCase(),
      name,
      code,
      flag: '🏳️',
      group: group ?? '',
    });

    const todayLocal = new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD
    return liveMatches
      .filter((row) => {
        const matchDayLocal = new Date(row.match_date).toLocaleDateString('en-CA');
        return matchDayLocal === todayLocal;
      })
      .map((row) => {
        const status: Match['status'] =
          row.status === 'IN_PLAY' || row.status === 'PAUSED' || row.status === 'LIVE'
            ? 'live'
            : row.status === 'FINISHED' || row.status === 'FT' || row.status === 'AET' || row.status === 'PEN'
              ? 'finished'
              : 'upcoming';

        const stageMap: Record<string, Match['stage']> = {
          group: 'group',
          round32: 'round32',
          round16: 'round16',
          quarter: 'quarter',
          semi: 'semi',
          third: 'third',
          final: 'final',
        };

        return {
          id: row.match_id,
          homeTeam: getTeamByCode(row.home_team_code) ?? fallbackTeam(row.home_team_code, row.home_team_name, row.group_name),
          awayTeam: getTeamByCode(row.away_team_code) ?? fallbackTeam(row.away_team_code, row.away_team_name, row.group_name),
          date: row.match_date,
          time: '',
          dateIso: row.match_date,
          venue: row.venue ?? '',
          city: row.city ?? '',
          stage: stageMap[row.stage] ?? 'group',
          group: row.group_name ?? undefined,
          homeScore: row.home_score ?? undefined,
          awayScore: row.away_score ?? undefined,
          status,
        };
      })
      .sort((a, b) => new Date(a.dateIso!).getTime() - new Date(b.dateIso!).getTime());
  }, [liveMatches, getTeamByCode]);

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
