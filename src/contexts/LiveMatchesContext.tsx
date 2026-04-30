// Single source of truth for live_matches data on the client.
//
// Why a context (vs. each hook owning its own state)? Three views need the
// same data:
//   - Today: full live_matches list, filtered to today's calendar day
//   - Groups: live_matches with stage='group', merged onto static fixtures
//   - Knockout: live_matches with stage<>'group', merged onto bracket
// Plus a fourth, the global GoalCelebration overlay, needs to react to
// score increases regardless of which screen the user is on.
//
// Before this provider, each hook ran its own fetch + EventSource and the
// SSE updates only flowed into the Today path. Centralising the state
// here gives every consumer the same push-driven data — and lets the
// goal-detection logic live in one place where we can compare prev→new
// scores accurately.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { api, ApiError } from '@/lib/apiClient';

export interface MatchGoal {
  id: string;
  minute: number;
  player_name: string;
  team_side: 'home' | 'away';
}

export interface LiveMatch {
  id: string;
  match_id: string;
  api_match_id?: number | null;
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
  // Optional because legacy SSE events from before the goals-aware emit
  // landed don't carry it; default to [] in render code.
  goals?: MatchGoal[];
}

export interface GoalEvent {
  // Monotonically incremented so consumers can use it as a React key —
  // re-mounting their animation even when the same match scores twice.
  id: number;
  matchId: string;
  scoredBy: 'home' | 'away';
  homeTeam: { name: string; code: string };
  awayTeam: { name: string; code: string };
  homeScore: number;
  awayScore: number;
}

const SYNC_COOLDOWN_SECONDS = 60;
const STREAM_URL =
  ((import.meta.env.VITE_API_URL as string | undefined) ?? '/api') + '/matches/stream';

interface ContextValue {
  matches: LiveMatch[];
  loading: boolean;
  lastSync: Date | null;
  syncing: boolean;
  cooldownRemaining: number;
  canSync: () => boolean;
  syncMatches: (
    force?: boolean,
  ) => Promise<{
    skipped?: boolean;
    success?: boolean;
    reason?: string;
    data?: unknown;
    error?: unknown;
  }>;
  refetch: () => Promise<Date | null>;
  // Queue rather than a single value. Two SSE events in the same React tick
  // (rapid admin saves, or PATCH + runSync re-emit) both push their goals;
  // the consumer animates them one at a time so neither is dropped to
  // React's state batching.
  goalQueue: GoalEvent[];
  dismissGoal: (id: number) => void;
  // Global boost-prediction deadline: kickoff of the first knockout match,
  // i.e. all boost picks lock at the same moment, between the end of group
  // stage and the start of KO. Null while we're still loading matches or
  // if no knockout fixture is yet in the table.
  boostsDeadline: Date | null;
}

const Ctx = createContext<ContextValue | null>(null);

const LIVE_STATUSES = new Set(['IN_PLAY', 'PAUSED', 'LIVE']);

export const LiveMatchesProvider = ({ children }: { children: ReactNode }) => {
  const [matches, setMatches] = useState<LiveMatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastSync, setLastSync] = useState<Date | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [cooldownRemaining, setCooldownRemaining] = useState(0);
  const [goalQueue, setGoalQueue] = useState<GoalEvent[]>([]);

  // Per-match score snapshot updated SYNCHRONOUSLY inside the SSE handler,
  // independent of React state. Two reasons:
  //   1) React-state-derived refs (e.g. `matchesRef.current = matches` in
  //      render body) only update once per render. If two SSE events fire
  //      in the same tick, the second sees the first's pre-update state.
  //   2) O(1) lookup instead of array.find on every event.
  // Seeded from the initial fetch so the first SSE event has a baseline.
  const prevScoresRef = useRef<Map<string, { home: number | null; away: number | null }>>(
    new Map(),
  );

  const goalSeqRef = useRef(0);
  const hasAutoSynced = useRef(false);

  const dismissGoal = useCallback((id: number) => {
    setGoalQueue((q) => q.filter((g) => g.id !== id));
  }, []);

  const fetchLiveMatches = useCallback(async (): Promise<Date | null> => {
    try {
      const data = await api.get<LiveMatch[]>('/matches');
      if (data) {
        const sorted = [...data].sort(
          (a, b) => new Date(a.match_date).getTime() - new Date(b.match_date).getTime(),
        );
        // Seed prev-scores BEFORE the SSE handler can run with this state.
        // Without seeding, the first SSE event for any match would have no
        // baseline to compare against and be silently dropped.
        for (const m of sorted) {
          prevScoresRef.current.set(m.match_id, {
            home: m.home_score,
            away: m.away_score,
          });
        }
        setMatches(sorted);
        if (sorted.length > 0) {
          const mostRecent = sorted.reduce((latest, m) => {
            const d = new Date(m.last_updated);
            return d > latest ? d : latest;
          }, new Date(0));
          setLastSync(mostRecent);
          return mostRecent;
        }
      }
    } catch (err) {
      console.error('[LiveMatchesContext] fetch error:', err);
    } finally {
      setLoading(false);
    }
    return null;
  }, []);

  const canSync = useCallback(() => {
    if (!lastSync) return true;
    const elapsed = (Date.now() - lastSync.getTime()) / 1000;
    return elapsed >= SYNC_COOLDOWN_SECONDS;
  }, [lastSync]);

  // Cooldown timer
  useEffect(() => {
    if (!lastSync) {
      setCooldownRemaining(0);
      return;
    }
    const tick = () => {
      const elapsed = (Date.now() - lastSync.getTime()) / 1000;
      setCooldownRemaining(Math.max(0, Math.ceil(SYNC_COOLDOWN_SECONDS - elapsed)));
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [lastSync]);

  const syncMatches = useCallback(
    async (force = false) => {
      if (!force && !canSync()) {
        return { skipped: true, reason: 'cooldown' as const };
      }
      setSyncing(true);
      try {
        const data = await api.post('/admin/sync-matches');
        await fetchLiveMatches();
        return { success: true, data };
      } catch (err) {
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
    },
    [fetchLiveMatches, canSync],
  );

  // Periodic auto-sync while at least one match is live. Without this, FD
  // score updates only flow when someone manually hits the Sync button —
  // unworkable during a 90-minute match where users want goals to appear.
  // Throttled to 60s and skipped when no live matches exist, so we don't
  // burn FD's free-tier quota during quiet hours.
  useEffect(() => {
    const anyLive = matches.some((m) => LIVE_STATUSES.has(m.status));
    if (!anyLive) return;
    const id = setInterval(() => {
      void syncMatches(true);
    }, 60_000);
    return () => clearInterval(id);
  }, [matches, syncMatches]);

  // Initial fetch + auto-sync once per session
  useEffect(() => {
    const init = async () => {
      const lastSyncTime = await fetchLiveMatches();
      setLoading(false);
      if (hasAutoSynced.current) return;
      hasAutoSynced.current = true;
      if (!lastSyncTime) {
        await syncMatches(true);
      } else {
        const elapsed = (Date.now() - lastSyncTime.getTime()) / 1000;
        if (elapsed >= SYNC_COOLDOWN_SECONDS) {
          await syncMatches(true);
        }
      }
    };
    void init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // SSE stream — single connection per browser tab. All consumers downstream
  // see the same updates, and goal detection has a single comparison point.
  useEffect(() => {
    const es = new EventSource(STREAM_URL);

    es.addEventListener('match-update', (ev) => {
      try {
        const incoming = JSON.parse((ev as MessageEvent).data) as LiveMatch;
        const prev = prevScoresRef.current.get(incoming.match_id);

        // Goal detection. Two guard rails:
        //   1) Only when status is "live" — avoids replaying the goals
        //      already embedded in a FINISHED row that arrives via a
        //      runSync re-emit just after the user opens the page.
        //   2) Only when we have a prior snapshot in prevScoresRef. The
        //      first time we see a match (no baseline yet), we just record
        //      the score; we don't celebrate retroactively.
        // Score going DOWN (VAR disallowed goal) is a no-op.
        //
        // Both home AND away can register a goal in the same event (rare,
        // but possible if an admin saves "0-0 → 1-1" in a single PATCH).
        // Independent ifs, not else-if.
        const newGoals: GoalEvent[] = [];
        if (prev && LIVE_STATUSES.has(incoming.status)) {
          const prevHome = prev.home ?? 0;
          const prevAway = prev.away ?? 0;
          const newHome = incoming.home_score ?? 0;
          const newAway = incoming.away_score ?? 0;
          if (newHome > prevHome) {
            newGoals.push({
              id: ++goalSeqRef.current,
              matchId: incoming.match_id,
              scoredBy: 'home',
              homeTeam: { name: incoming.home_team_name, code: incoming.home_team_code },
              awayTeam: { name: incoming.away_team_name, code: incoming.away_team_code },
              homeScore: newHome,
              awayScore: newAway,
            });
          }
          if (newAway > prevAway) {
            newGoals.push({
              id: ++goalSeqRef.current,
              matchId: incoming.match_id,
              scoredBy: 'away',
              homeTeam: { name: incoming.home_team_name, code: incoming.home_team_code },
              awayTeam: { name: incoming.away_team_name, code: incoming.away_team_code },
              homeScore: newHome,
              awayScore: newAway,
            });
          }
        }

        // Update prev-scores ref synchronously, BEFORE the next SSE event
        // can fire. React's state batching can delay setMatches by a tick;
        // this ref isn't subject to that.
        prevScoresRef.current.set(incoming.match_id, {
          home: incoming.home_score,
          away: incoming.away_score,
        });

        if (newGoals.length > 0) {
          // Functional update: even if React batches multiple events into
          // the same render, every event's goals make it into the queue.
          setGoalQueue((q) => [...q, ...newGoals]);
        }

        setMatches((rows) => {
          const idx = rows.findIndex((r) => r.match_id === incoming.match_id);
          if (idx === -1) {
            const next = [...rows, incoming];
            next.sort(
              (a, b) => new Date(a.match_date).getTime() - new Date(b.match_date).getTime(),
            );
            return next;
          }
          const next = [...rows];
          next[idx] = incoming;
          return next;
        });
        setLastSync(new Date(incoming.last_updated));
      } catch (err) {
        console.error('[match-stream] parse error:', err);
      }
    });

    es.addEventListener('error', () => {
      // EventSource auto-reconnects unless CLOSED, which usually means the
      // endpoint is genuinely unreachable (404 / CORS / wrong origin).
      if (es.readyState === EventSource.CLOSED) {
        console.warn('[match-stream] connection closed permanently');
      }
    });

    return () => es.close();
  }, []);

  // Deadline for boost-style predictions = kickoff of the first knockout
  // match. Falls in the natural window between "last group game ended"
  // and "knockout stage starts", which is what the product wants. Memoised
  // so we don't re-derive on every render — recomputes only when the
  // matches array reference changes (i.e. on a new sync).
  const boostsDeadline = useMemo<Date | null>(() => {
    const koDates = matches
      .filter((m) => m.stage && m.stage !== 'group' && m.match_date)
      .map((m) => new Date(m.match_date).getTime())
      .filter((t) => Number.isFinite(t));
    if (koDates.length === 0) return null;
    return new Date(Math.min(...koDates));
  }, [matches]);

  return (
    <Ctx.Provider
      value={{
        matches,
        loading,
        lastSync,
        syncing,
        cooldownRemaining,
        canSync,
        syncMatches,
        refetch: fetchLiveMatches,
        goalQueue,
        dismissGoal,
        boostsDeadline,
      }}
    >
      {children}
    </Ctx.Provider>
  );
};

export const useLiveMatchesContext = (): ContextValue => {
  const v = useContext(Ctx);
  if (!v) {
    throw new Error('useLiveMatchesContext must be used within <LiveMatchesProvider>');
  }
  return v;
};
