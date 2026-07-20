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
import { useCompetitionsSafe } from '@/contexts/CompetitionContext';

export interface MatchGoal {
  id: string;
  minute: number;
  player_name: string;
  team_side: 'home' | 'away';
  goal_type?: string | null;
}

export interface MatchBooking {
  id: string;
  minute: number;
  player_name: string;
  team_side: 'home' | 'away';
  card_type: 'yellow' | 'second_yellow' | 'red';
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
  // Penalty-shootout result (knockout matches that went to PSO only).
  // Both null for regulation/ET-decided matches. Doesn't affect scoring
  // — purely informational for the UI badge.
  penalty_home_score?: number | null;
  penalty_away_score?: number | null;
  // FD's match.score.duration. Null for unplayed matches; once decided:
  //   REGULAR          — full-time finish (no badge)
  //   EXTRA_TIME       — won in ET (show "AET")
  //   PENALTY_SHOOTOUT — went to pens (show "AET" + pen score line)
  duration?: 'REGULAR' | 'EXTRA_TIME' | 'PENALTY_SHOOTOUT' | null;
  match_date: string;
  venue: string | null;
  city: string | null;
  stage: string;
  group_name: string | null;
  // Multi-competition columns. Optional because SSE events emitted by a
  // not-yet-redeployed API (or cached rows) may lack them.
  competition_id?: string | null;
  matchday?: number | null;
  status: string;
  last_updated: string;
  // Optional because legacy SSE events from before the goals-aware emit
  // landed don't carry it; default to [] in render code.
  goals?: MatchGoal[];
  bookings?: MatchBooking[];
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

// Fallback polling cadence when SSE looks unhealthy. The server runs its
// own 60s football-data.org sync loop during live play and pushes results
// over SSE, so a healthy client never needs to poll — this is purely a
// safety net for broken/silent streams (proxy buffering, sleeping laptops,
// flaky mobile networks).
const FALLBACK_POLL_MS = 5 * 60_000;
// How long the stream may go without any event before we consider it
// "silent" and allow a fallback refetch.
const SSE_SILENCE_MS = 5 * 60_000;
// How often we re-evaluate the fallback conditions. Cheap (no network
// unless the guards pass).
const FALLBACK_CHECK_MS = 60_000;

interface ContextValue {
  matches: LiveMatch[];
  // Every fetched competition's rows (profile stats aggregate across
  // competitions). Best-effort: contains only lazily-fetched buckets.
  allMatches: LiveMatch[];
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
  // True once we have at least one fixture loaded — i.e. there's
  // something for the Stats tab to render, even if only an empty state
  // with the upcoming-tournament framing. Originally gated on "kickoff
  // has passed" so the run-up didn't show an empty page; we relaxed it
  // because the empty state itself ("First goals incoming") is good
  // enough to live in front of users from the moment fixtures land —
  // and it builds the right anticipation in the lead-up.
  tournamentStarted: boolean;
  // True while at least one match is currently being played — drives
  // the LIVE badge + provisional-points helper on league leaderboards
  // (points from in-play matches update live and lock at full time;
  // product decision June 12, option "live leaderboard").
  anyMatchLive: boolean;
}

const Ctx = createContext<ContextValue | null>(null);

const LIVE_STATUSES = new Set(['IN_PLAY', 'PAUSED', 'LIVE']);

// Bucket key for rows whose competition we can't identify (legacy SSE
// events from a pre-multi-competition API, rows missing competition_id).
const UNSCOPED = '__all__';

export const LiveMatchesProvider = ({ children }: { children: ReactNode }) => {
  // Matches are stored per competition and fetched lazily when a
  // competition becomes active — BL1 (306) + CL (~203) + WC (104) rows
  // with embedded goals/bookings arrays are too heavy to fetch eagerly.
  // `matches` (the public field every consumer reads) is the ACTIVE
  // competition's bucket, so downstream hooks keep working unchanged.
  const [buckets, setBuckets] = useState<Record<string, LiveMatch[]>>({});
  const fetchedCompsRef = useRef<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [lastSync, setLastSync] = useState<Date | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [cooldownRemaining, setCooldownRemaining] = useState(0);
  const [goalQueue, setGoalQueue] = useState<GoalEvent[]>([]);

  // Tolerant: null on surfaces without a CompetitionProvider — behaves
  // like the single-competition era (one unscoped bucket).
  const competitionCtx = useCompetitionsSafe();
  const activeComp = competitionCtx?.activeCompetition ?? null;
  const activeBucketKey = activeComp?.id ?? UNSCOPED;
  const matches = buckets[activeBucketKey] ?? [];

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

  // Fetch one competition's matches into its bucket (or everything into
  // the unscoped bucket when no competition context is available).
  const fetchLiveMatches = useCallback(async (): Promise<Date | null> => {
    const slug = activeComp?.slug ?? null;
    const bucketKey = activeComp?.id ?? UNSCOPED;
    try {
      const data = await api.get<LiveMatch[]>(
        slug ? `/matches?competition=${encodeURIComponent(slug)}` : '/matches',
      );
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
        fetchedCompsRef.current.add(bucketKey);
        setBuckets((prev) => ({ ...prev, [bucketKey]: sorted }));
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
  }, [activeComp?.slug, activeComp?.id]);

  // Lazy per-competition fetch: when the active competition changes to one
  // we haven't loaded yet, pull its bucket. Surfaces without a
  // CompetitionProvider get the legacy fetch-everything behavior once.
  useEffect(() => {
    if (activeComp) {
      if (fetchedCompsRef.current.has(activeComp.id)) return;
      setLoading(true);
      void fetchLiveMatches();
    } else if (competitionCtx === null && !fetchedCompsRef.current.has(UNSCOPED)) {
      void fetchLiveMatches();
    }
  }, [activeComp, competitionCtx, fetchLiveMatches]);

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
        const status = err instanceof ApiError ? err.status : null;
        if (status === 403) {
          console.debug('[sync-matches] forbidden — skipping (likely unauthenticated)');
        } else if (status === 409) {
          // No active competitions to sync (e.g. archive-only period
          // between seasons) — expected, not an error.
          console.debug('[sync-matches] no active competitions — skipping');
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

  // NOTE: clients used to run their own 60s `syncMatches(true)` interval
  // here while a match was live. With N connected browsers that was an
  // O(N) sync storm against football-data.org and the DB. The API now runs
  // a single server-side 60s sync loop during live play (api/src/lib/
  // matchSync.ts) and pushes updates over SSE — clients only keep the
  // cheap fallback poll below for when the stream goes bad.

  // SSE health bookkeeping for the fallback poll: when the stream last
  // delivered an event, and whether it's currently open. Refs, not state —
  // we read these inside an interval and don't want re-renders.
  const lastSseEventAtRef = useRef<number>(Date.now());
  const sseOpenRef = useRef(false);
  const lastFallbackFetchAtRef = useRef<number>(0);

  // Fallback: refetch GET /matches (NOT the sync endpoint — the server
  // syncs on its own) only when the SSE stream is closed or has been
  // silent for a while, at most once per FALLBACK_POLL_MS, and only when
  // the tab is actually visible. Backgrounded tabs do nothing.
  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      const now = Date.now();
      const sseUnhealthy =
        !sseOpenRef.current || now - lastSseEventAtRef.current > SSE_SILENCE_MS;
      if (!sseUnhealthy) return;
      if (now - lastFallbackFetchAtRef.current < FALLBACK_POLL_MS) return;
      lastFallbackFetchAtRef.current = now;
      void fetchLiveMatches();
    }, FALLBACK_CHECK_MS);
    return () => clearInterval(id);
  }, [fetchLiveMatches]);

  // Auto-sync once per session, after the first bucket has loaded and only
  // when the data looks stale. (The server runs its own sync scheduler —
  // this just freshens a tenant whose data went stale between deploys.)
  useEffect(() => {
    if (loading || hasAutoSynced.current) return;
    if (competitionCtx !== null && !activeComp) return; // competitions still resolving
    hasAutoSynced.current = true;
    const stale =
      !lastSync || (Date.now() - lastSync.getTime()) / 1000 >= SYNC_COOLDOWN_SECONDS;
    if (stale) void syncMatches(true);
  }, [loading, lastSync, activeComp, competitionCtx, syncMatches]);

  // SSE stream — single connection per browser tab. All consumers downstream
  // see the same updates, and goal detection has a single comparison point.
  useEffect(() => {
    const es = new EventSource(STREAM_URL);

    es.addEventListener('open', () => {
      sseOpenRef.current = true;
      // A (re)connect counts as a sign of life — reset the silence clock so
      // the fallback poll doesn't fire right after a successful reconnect.
      lastSseEventAtRef.current = Date.now();
    });

    es.addEventListener('match-update', (ev) => {
      try {
        lastSseEventAtRef.current = Date.now();
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

        // Route the row to its competition's bucket. Legacy events without
        // competition_id (API mid-deploy) fall back to whichever bucket
        // already holds the match, else the unscoped bucket.
        setBuckets((prev) => {
          let key = incoming.competition_id ?? null;
          if (!key) {
            key =
              Object.keys(prev).find((k) =>
                prev[k]!.some((r) => r.match_id === incoming.match_id),
              ) ?? UNSCOPED;
          }
          const rows = prev[key] ?? [];
          const idx = rows.findIndex((r) => r.match_id === incoming.match_id);
          let next: LiveMatch[];
          if (idx === -1) {
            next = [...rows, incoming];
            next.sort(
              (a, b) => new Date(a.match_date).getTime() - new Date(b.match_date).getTime(),
            );
          } else {
            next = [...rows];
            next[idx] = incoming;
          }
          return { ...prev, [key]: next };
        });
        setLastSync(new Date(incoming.last_updated));
      } catch (err) {
        console.error('[match-stream] parse error:', err);
      }
    });

    es.addEventListener('error', () => {
      // Any error means the stream is at least momentarily down — let the
      // fallback poll take over until 'open' fires again.
      sseOpenRef.current = false;
      // EventSource auto-reconnects unless CLOSED, which usually means the
      // endpoint is genuinely unreachable (404 / CORS / wrong origin).
      if (es.readyState === EventSource.CLOSED) {
        console.warn('[match-stream] connection closed permanently');
      }
    });

    return () => {
      sseOpenRef.current = false;
      es.close();
    };
  }, []);

  // Boost-prediction deadline for the ACTIVE competition, mirroring the
  // server's boostDeadline.ts exactly:
  //   1. competitions.boost_lock_at wins when set (WC archive is pinned).
  //   2. league format: first kickoff of the season (a pure league has no
  //      knockout stage — the old "first non-group kickoff" rule returned
  //      null and boosts never locked).
  //   3. tournament/hybrid: first knockout kickoff, where 'group',
  //      'regular' and 'league' all count as the regular phase.
  const NON_KNOCKOUT_STAGES = ['group', 'regular', 'league'];
  const boostsDeadline = useMemo<Date | null>(() => {
    if (activeComp?.boost_lock_at) {
      const d = new Date(activeComp.boost_lock_at);
      if (Number.isFinite(d.getTime())) return d;
    }
    const isLeague = activeComp?.format === 'league';
    const dates = matches
      .filter((m) => m.match_date && (isLeague || (m.stage && !NON_KNOCKOUT_STAGES.includes(m.stage))))
      .map((m) => new Date(m.match_date).getTime())
      .filter((t) => Number.isFinite(t));
    if (dates.length === 0) return null;
    return new Date(Math.min(...dates));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matches, activeComp?.boost_lock_at, activeComp?.format]);

  // True once at least one fixture has been loaded. The earlier
  // "kickoff has actually happened" check made the Stats tab pop into
  // the nav at an awkward moment (mid-first-half of the opener); now
  // it shows up the moment we have fixtures and the empty state
  // ("First goals incoming") carries the run-up.
  const tournamentStarted = useMemo<boolean>(
    () => matches.length > 0,
    [matches],
  );

  // Liveness is GLOBAL (any bucket): a live Bundesliga match moves overall
  // leaderboards even while the user is looking at another competition.
  const anyMatchLive = useMemo<boolean>(
    () => Object.values(buckets).some((rows) => rows.some((m) => LIVE_STATUSES.has(m.status))),
    [buckets],
  );

  const allMatches = useMemo(() => Object.values(buckets).flat(), [buckets]);

  return (
    <Ctx.Provider
      value={{
        matches,
        allMatches,
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
        tournamentStarted,
        anyMatchLive,
      }}
    >
      {children}
    </Ctx.Provider>
  );
};

/**
 * Null-safe variant for components that also render outside the tenant
 * shell (e.g. LeaguesView on the legacy non-tenant Index page, which has
 * no LiveMatchesProvider). Returns null instead of throwing.
 */
export const useLiveMatchesOptional = (): ContextValue | null => useContext(Ctx);

export const useLiveMatchesContext = (): ContextValue => {
  const v = useContext(Ctx);
  if (!v) {
    throw new Error('useLiveMatchesContext must be used within <LiveMatchesProvider>');
  }
  return v;
};
