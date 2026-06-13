// Match sync against football-data.org — extracted from routes/admin.ts so
// it can be driven both by the manual admin trigger (POST /admin/sync-matches)
// and by the server-side scheduler started at boot. Behavior of runSync is
// unchanged from the route-embedded version; only the *initiation* moved.
//
// Why server-side scheduling at all: previously every connected browser ran
// its own 60s sync interval while a match was live. With N clients that's an
// O(N) storm against football-data.org (rate-limited) and the DB. One server
// loop makes sync cost scale with match count, not user count; clients get
// updates over SSE.

import { sql } from "../db";
import { emitMatchEvent, type LiveMatchEvent } from "./matchEvents";

const FOOTBALL_API_BASE = "https://api.football-data.org/v4";
const COMPETITION_CODE = "WC";

// Re-fetch the full live_matches row + its goals for SSE emission. Used
// from any code path that mutates either the match itself OR its goal
// list, so subscribers always see the freshest state without separately
// listening for "match changed" vs "goals changed" event types.
export async function fetchMatchWithGoals(matchId: string): Promise<LiveMatchEvent | null> {
  // Correlated subquery instead of LEFT JOIN + GROUP BY: live_matches' PK
  // is `id`, not `match_id`, so GROUP BY match_id wouldn't license a
  // SELECT lm.* and Postgres rejects with 42803.
  const rows = await sql`
    SELECT lm.*,
      COALESCE((
        SELECT json_agg(
          json_build_object(
            'id', mg.id,
            'minute', mg.minute,
            'player_name', mg.player_name,
            'team_side', mg.team_side,
            'goal_type', mg.goal_type
          ) ORDER BY mg.minute, mg.created_at
        )
        FROM public.match_goals mg
        WHERE mg.match_id = lm.match_id
      ), '[]'::json) AS goals,
      COALESCE((
        SELECT json_agg(
          json_build_object(
            'id', mb.id,
            'minute', mb.minute,
            'player_name', mb.player_name,
            'team_side', mb.team_side,
            'card_type', mb.card_type
          ) ORDER BY mb.minute, mb.created_at
        )
        FROM public.match_bookings mb
        WHERE mb.match_id = lm.match_id
      ), '[]'::json) AS bookings
    FROM public.live_matches lm
    WHERE lm.match_id = ${matchId}
  `;
  return rows.length === 0 ? null : (rows[0] as unknown as LiveMatchEvent);
}

interface FootballDataMatch {
  id: number;
  utcDate: string;
  status: string;
  matchday: number;
  stage: string;
  group: string | null;
  homeTeam: { id: number; name: string; shortName: string; tla: string };
  awayTeam: { id: number; name: string; shortName: string; tla: string };
  // FD's score object carries more than fullTime — `duration` flags
  // whether the match went to extra time or penalties, and `penalties`
  // gives the shootout result on knockouts that needed one. Both are
  // optional: REGULAR matches have no penalties object, scheduled
  // matches have null scores. We surface them on live_matches so the
  // UI can show "AET" / "5-4 PSO Spain" without inventing the data.
  score: {
    fullTime: { home: number | null; away: number | null };
    duration?: "REGULAR" | "EXTRA_TIME" | "PENALTY_SHOOTOUT";
    penalties?: { home: number | null; away: number | null };
  };
  venue: string | null;
  // Present on TIER_TWO+ keys. Each entry has `minute`, optional
  // `injuryTime`, `type` (REGULAR/PENALTY/OWN/...), and `team`/`scorer`/
  // `assist` objects. We only persist minute + scorer + team-side, so
  // the schema is loose on the rest.
  goals?: Array<{
    minute: number;
    injuryTime?: number | null;
    type?: string;
    team?: { id?: number; name?: string };
    scorer?: { id?: number; name?: string };
  }>;
  // Also TIER_TWO+. Mirror shape to goals — same team/player envelope
  // plus a `card` enum. Persisted into match_bookings for the Stats tab
  // discipline panel. `card` values FD uses:
  //   YELLOW         → 'yellow'
  //   YELLOW_RED     → 'second_yellow' (a 2nd yellow → automatic red)
  //   RED            → 'red'
  bookings?: Array<{
    minute: number;
    team?: { id?: number; name?: string };
    player?: { id?: number; name?: string };
    card?: string;
  }>;
}

// Replace match_goals for a given match with whatever FD currently
// reports. Source-of-truth model: FD's goal list wins. If admin had hand-
// entered goals before FD caught up, those get overwritten — fine, since
// match_goals is keyed off the *match* not the *event* (we don't have a
// stable goal-id from FD anyway). team_side is derived by comparing the
// goal's team.name to the match's FD home-team-name.
async function syncGoalsFromFD(
  matchId: string,
  match: FootballDataMatch,
): Promise<void> {
  const fdGoals = match.goals ?? [];
  await sql`DELETE FROM public.match_goals WHERE match_id = ${matchId}`;
  if (fdGoals.length === 0) return;
  const homeName = match.homeTeam?.name ?? '';
  // Single bulk INSERT instead of one round-trip per goal — across a full
  // 104-match sync the per-row version was a large share of ~2,000
  // sequential queries holding pool connections.
  const rows = fdGoals
    .filter((g) => g.scorer?.name && g.minute != null)
    .map((g) => {
      const type = (g.type ?? '').toUpperCase();
      // FD's `team` on a goal is the team the SCORER plays for. For an
      // OWN goal that's the conceding team, so the goal counts for the
      // OTHER side — flip it. (USA 4-1 PAR, June 13: a 7' own goal by a
      // Paraguay player belongs on the USA tally; without the flip USA
      // showed 3 of its 4 goals.) Regular/penalty goals count for the
      // scorer's team as normal.
      const scorerIsHome = g.team?.name === homeName;
      const countsForHome = type === 'OWN' ? !scorerIsHome : scorerIsHome;
      return {
        match_id: matchId,
        minute: g.minute,
        player_name: g.scorer!.name!,
        team_side: countsForHome ? 'home' : 'away',
        goal_type: g.type ?? null,
      };
    });
  if (rows.length === 0) return;
  await sql`
    INSERT INTO public.match_goals ${sql(rows, 'match_id', 'minute', 'player_name', 'team_side', 'goal_type')}
  `;
}

// Same pattern as syncGoalsFromFD — FD's bookings array wins, we
// overwrite anything we had before. Maps FD's card enum to our internal
// values. Unknown card strings are dropped (defensively skipped rather
// than crashing the whole match sync).
function mapCard(card: string | undefined): 'yellow' | 'second_yellow' | 'red' | null {
  switch ((card ?? '').toUpperCase()) {
    case 'YELLOW':
      return 'yellow';
    case 'YELLOW_RED':
      return 'second_yellow';
    case 'RED':
      return 'red';
    default:
      return null;
  }
}

async function syncBookingsFromFD(
  matchId: string,
  match: FootballDataMatch,
): Promise<void> {
  const fdBookings = match.bookings ?? [];
  await sql`DELETE FROM public.match_bookings WHERE match_id = ${matchId}`;
  if (fdBookings.length === 0) return;
  const homeName = match.homeTeam?.name ?? '';
  // Bulk INSERT — see syncGoalsFromFD for rationale.
  const rows = fdBookings
    .filter((b) => b.player?.name && b.minute != null && mapCard(b.card) !== null)
    .map((b) => ({
      match_id: matchId,
      minute: b.minute,
      player_name: b.player!.name!,
      team_side: b.team?.name === homeName ? 'home' : 'away',
      card_type: mapCard(b.card)!,
    }));
  if (rows.length === 0) return;
  await sql`
    INSERT INTO public.match_bookings ${sql(rows, 'match_id', 'minute', 'player_name', 'team_side', 'card_type')}
  `;
}

// Use football-data.org's stable numeric match id as the canonical key.
// Earlier we derived it from teams + stage + matchday, but for knockouts
// both teams are "TBD" until the draw — so every quarter-final ended up
// with the same key and UPSERT collapsed them into one row.
function generateMatchId(match: FootballDataMatch): string {
  return `fd-${match.id}`;
}

function mapStage(apiStage: string): string {
  // WC 2026 adds a round of 32 because 48 teams qualify. Earlier tournaments
  // went straight to round of 16. Default-casing to 'group' used to silently
  // miscategorise LAST_32 fixtures.
  const m: Record<string, string> = {
    GROUP_STAGE: "group",
    LAST_32: "round32",
    LAST_16: "round16",
    QUARTER_FINALS: "quarter",
    SEMI_FINALS: "semi",
    THIRD_PLACE: "third",
    FINAL: "final",
  };
  return m[apiStage] ?? apiStage.toLowerCase();
}

// Football-Data.org /competitions/WC/teams response. Populated once FIFA
// finalises the roster (post-playoffs, post-March 2026). The payload
// also carries inline `squad` arrays but those are consumed by the
// dedicated POST /players/admin/sync-from-fd endpoint, NOT here — the
// match-sync code stays narrowly scoped to matches+teams.
interface FootballDataTeam {
  id: number;
  name: string;
  shortName?: string;
  tla: string;
  crest?: string;
}

// Derive each team's group_name by looking at the first group-stage fixture
// the team appears in and reading its GROUP_X label. Returns a Map keyed by tla.
function computeTeamGroups(matches: FootballDataMatch[]): Map<string, string> {
  const out = new Map<string, string>();
  for (const m of matches) {
    if (m.stage !== "GROUP_STAGE" || !m.group) continue;
    // "GROUP_A" → "A"
    const letter = m.group.replace(/^GROUP_/, "");
    const home = m.homeTeam.tla;
    const away = m.awayTeam.tla;
    if (home) out.set(home, letter);
    if (away) out.set(away, letter);
  }
  return out;
}

// Simple in-memory sync job state. Enough for the singleton-admin use case.
// If we ever need per-tenant sync or multiple instances, replace with a DB row.
export interface SyncState {
  status: "idle" | "running" | "success" | "failed";
  startedAt: string | null;
  finishedAt: string | null;
  matchesUpdated: number;
  teamsUpdated: number;
  totalMatches: number;
  error: string | null;
}
export const syncState: SyncState = {
  status: "idle",
  startedAt: null,
  finishedAt: null,
  matchesUpdated: 0,
  teamsUpdated: 0,
  totalMatches: 0,
  error: null,
};

export async function runSync(apiKey: string): Promise<void> {
  syncState.status = "running";
  syncState.startedAt = new Date().toISOString();
  syncState.finishedAt = null;
  syncState.matchesUpdated = 0;
  syncState.teamsUpdated = 0;
  syncState.totalMatches = 0;
  syncState.error = null;

  try {
    const [matchesRes, teamsRes] = await Promise.all([
      fetch(`${FOOTBALL_API_BASE}/competitions/${COMPETITION_CODE}/matches`, {
        headers: { "X-Auth-Token": apiKey },
      }),
      fetch(`${FOOTBALL_API_BASE}/competitions/${COMPETITION_CODE}/teams`, {
        headers: { "X-Auth-Token": apiKey },
      }),
    ]);

    if (matchesRes.status === 404) {
      syncState.status = "success";
      syncState.error = "World Cup 2026 data not yet available in football-data.org";
      syncState.finishedAt = new Date().toISOString();
      return;
    }
    if (!matchesRes.ok) {
      throw new Error(`Football API matches returned ${matchesRes.status}: ${await matchesRes.text()}`);
    }

    const matchesData = (await matchesRes.json()) as { matches?: FootballDataMatch[] };
    const matches = matchesData.matches ?? [];
    syncState.totalMatches = matches.length;
    console.log(`[sync-matches] got ${matches.length} matches from football-data.org, inserting…`);

    // Sequential inserts — we've already returned 202 to the client so
    // Envoy's upstream timeout is irrelevant. Sequential is more predictable
    // than Promise.allSettled with a lazy postgres.js template (which appeared
    // to silently stall at scale on Bun). Also updates syncState.matchesUpdated
    // as we go so polling reflects actual progress.
    //
    // Per-run cap on single-match detail fetches (goals/bookings live
    // only on /v4/matches/{id} on our tier — see the event-sync block
    // below). Group stage peaks at ~6 matches inside the 12 h window,
    // so 10 leaves headroom without risking FD's per-minute rate limit
    // on top of the 2 list calls.
    let detailFetchBudget = 10;
    for (const match of matches) {
      try {
        // postgres.js rejects `undefined` parameters — FD omits fields like
        // `group` for knockout matches and `score.fullTime.home` for unplayed
        // fixtures, so every `?? null` below matters.
        const homeCode =
          match.homeTeam?.tla ||
          match.homeTeam?.shortName?.substring(0, 3).toUpperCase() ||
          "TBD";
        const awayCode =
          match.awayTeam?.tla ||
          match.awayTeam?.shortName?.substring(0, 3).toUpperCase() ||
          "TBD";
        // Penalty-shootout result + duration come from FD's `score`
        // object alongside fullTime. Both null for unplayed / regulation-
        // ended matches — the columns are nullable.
        const penHome = match.score?.penalties?.home ?? null;
        const penAway = match.score?.penalties?.away ?? null;
        const duration = match.score?.duration ?? null;
        const upserted = await sql`
          INSERT INTO public.live_matches (
            match_id, api_match_id, home_team_name, home_team_code,
            away_team_name, away_team_code, home_score, away_score,
            penalty_home_score, penalty_away_score, duration,
            match_date, venue, city, stage, group_name, status, last_updated
          ) VALUES (
            ${generateMatchId(match)},
            ${match.id ?? null},
            ${match.homeTeam?.name ?? "TBD"},
            ${homeCode},
            ${match.awayTeam?.name ?? "TBD"},
            ${awayCode},
            ${match.score?.fullTime?.home ?? null},
            ${match.score?.fullTime?.away ?? null},
            ${penHome},
            ${penAway},
            ${duration},
            ${match.utcDate ?? null},
            ${match.venue ?? null},
            ${null},
            ${mapStage(match.stage)},
            ${match.group ? match.group.replace(/^GROUP_/, "") : null},
            ${match.status ?? "SCHEDULED"},
            NOW()
          )
          ON CONFLICT (match_id) DO UPDATE SET
            api_match_id   = EXCLUDED.api_match_id,
            -- Team fields: knockout rounds start as "TBD" and get filled in
            -- once the bracket resolves, so update these on every sync.
            home_team_name = EXCLUDED.home_team_name,
            home_team_code = EXCLUDED.home_team_code,
            away_team_name = EXCLUDED.away_team_name,
            away_team_code = EXCLUDED.away_team_code,
            home_score     = EXCLUDED.home_score,
            away_score     = EXCLUDED.away_score,
            -- PSO fields update with the rest. manual_override below
            -- still blocks the whole UPDATE on overridden rows, so an
            -- admin-edited "AET (1-0)" survives the next FD sync.
            penalty_home_score = EXCLUDED.penalty_home_score,
            penalty_away_score = EXCLUDED.penalty_away_score,
            duration           = EXCLUDED.duration,
            match_date     = EXCLUDED.match_date,
            venue          = EXCLUDED.venue,
            -- city is admin-only (FD doesn't supply it), but releasing an
            -- override should fully revert all admin edits — so on a non-
            -- overridden row we reset city to FD's value (NULL).
            city           = EXCLUDED.city,
            stage          = EXCLUDED.stage,
            group_name     = EXCLUDED.group_name,
            status         = EXCLUDED.status,
            last_updated   = NOW()
          WHERE NOT public.live_matches.manual_override
          RETURNING *
        `;
        syncState.matchesUpdated++;
        // RETURNING is empty when ON CONFLICT's WHERE clause fails (i.e. the
        // row had manual_override=true and the update was skipped). Only
        // push to SSE clients on rows that actually changed — otherwise
        // we'd flood the stream every minute with no-ops.
        if (upserted && upserted.length > 0) {
          // Pull FD's goal/booking events into match_goals/match_bookings.
          // Same lock semantics as the match itself: when
          // manual_override=true the upsert returns no row, so we don't
          // touch the events either.
          //
          // CRITICAL tier detail (discovered when the opening match
          // finished with zero scorers/cards, 2026-06-11): the
          // competition LIST endpoint returns goals:[] and bookings:[]
          // on our subscription — the events only exist on the
          // single-match endpoint /v4/matches/{id}. So for matches that
          // have recently kicked off we fetch the detail resource and
          // sync events from THAT. For everything else we skip event
          // syncing entirely rather than letting the list's empty
          // arrays delete-and-insert-nothing (which is what silently
          // wiped/blocked all events until now, and would also nuke any
          // admin-entered goals every 60 s).
          const upMatchId = (upserted[0] as { match_id: string }).match_id;
          const kickoffMs = Date.parse(match.utcDate);
          const startedRecently =
            ["IN_PLAY", "PAUSED", "FINISHED"].includes(match.status) &&
            Number.isFinite(kickoffMs) &&
            Date.now() - kickoffMs < 12 * 3600_000 &&
            kickoffMs <= Date.now();
          const listHasEvents =
            (match.goals?.length ?? 0) > 0 || (match.bookings?.length ?? 0) > 0;

          if (listHasEvents) {
            // Higher tier / future FD change: list already carries events.
            await syncGoalsFromFD(upMatchId, match);
            await syncBookingsFromFD(upMatchId, match);
          } else if (startedRecently && detailFetchBudget > 0) {
            detailFetchBudget--;
            try {
              const dRes = await fetch(`${FOOTBALL_API_BASE}/matches/${match.id}`, {
                headers: { "X-Auth-Token": apiKey },
              });
              if (dRes.ok) {
                const detail = (await dRes.json()) as FootballDataMatch;
                await syncGoalsFromFD(upMatchId, detail);
                await syncBookingsFromFD(upMatchId, detail);
              } else {
                console.warn(
                  `[sync-matches] detail fetch for ${match.id} returned ${dRes.status}`
                );
              }
            } catch (err) {
              console.error(`[sync-matches] detail fetch for ${match.id} failed:`, err);
            }
          }
          const enriched = await fetchMatchWithGoals(upMatchId);
          if (enriched) emitMatchEvent(enriched);
        }
      } catch (err) {
        console.error(`[sync-matches] match ${match.id} failed:`, err);
      }
    }
    console.log(`[sync-matches] matches done: ${syncState.matchesUpdated}/${matches.length}`);

    // Upsert teams.
    if (teamsRes.ok) {
      const teamsData = (await teamsRes.json()) as { teams?: FootballDataTeam[] };
      const teams = teamsData.teams ?? [];
      const groupMap = computeTeamGroups(matches);
      console.log(`[sync-matches] got ${teams.length} teams, inserting…`);

      for (const team of teams) {
        if (!team.tla) continue;
        const group = groupMap.get(team.tla) ?? null;
        try {
          // FD's numeric team id is the STABLE key; the TLA is not — FD
          // renamed Uruguay URU→URY and Curaçao CUR→CUW mid-tournament
          // (June 2026). The old tla-keyed upsert missed the conflict on
          // the renamed TLA and slammed into the fd_team_id unique
          // instead, erroring on every sync (~1/min of Postgres log
          // noise) and leaving the teams row permanently stale. So:
          // update by fd_team_id first; only fall back to the tla upsert
          // for rows that predate fd_team_id backfill (or teams FD sends
          // without an id).
          let updated: readonly unknown[] = [];
          if (team.id != null) {
            updated = await sql`
              UPDATE public.teams SET
                tla         = ${team.tla},
                name        = ${team.name ?? team.tla},
                short_name  = ${team.shortName ?? team.name ?? team.tla},
                crest_url   = ${team.crest ?? null},
                group_name  = ${group},
                updated_at  = NOW()
              WHERE fd_team_id = ${team.id}
              RETURNING id
            `;
          }
          if (updated.length === 0) {
            await sql`
              INSERT INTO public.teams (id, tla, name, short_name, crest_url, group_name, fd_team_id, updated_at)
              VALUES (
                gen_random_uuid(),
                ${team.tla},
                ${team.name ?? team.tla},
                ${team.shortName ?? team.name ?? team.tla},
                ${team.crest ?? null},
                ${group},
                ${team.id ?? null},
                NOW()
              )
              ON CONFLICT (tla) DO UPDATE SET
                name        = EXCLUDED.name,
                short_name  = EXCLUDED.short_name,
                crest_url   = EXCLUDED.crest_url,
                group_name  = EXCLUDED.group_name,
                fd_team_id  = EXCLUDED.fd_team_id,
                updated_at  = NOW()
            `;
          }
          syncState.teamsUpdated++;
        } catch (err) {
          console.error(`[sync-matches] team ${team.tla} failed:`, err);
        }
      }
      console.log(`[sync-matches] teams done: ${syncState.teamsUpdated}/${teams.length}`);
    }

    syncState.status = "success";
    syncState.finishedAt = new Date().toISOString();
  } catch (err) {
    syncState.status = "failed";
    syncState.error = err instanceof Error ? err.message : String(err);
    syncState.finishedAt = new Date().toISOString();
    console.error("[sync-matches] failed:", err);
  }
}

// One-off: re-pull goals + bookings for every already-played match,
// bypassing runSync's 12-hour recency window. Needed when the EVENT
// derivation logic changes and historical matches must be rewritten —
// e.g. the own-goal side-flip fix (June 13): finished matches older than
// 12h would otherwise keep their wrong attribution forever, since the
// scheduler only re-syncs events for recently-kicked-off matches.
//
// Events live only on FD's single-match detail endpoint on our tier, so
// this fetches detail per match. Paced at ~7s/request to stay under the
// 10-req/min limit; with a handful of played matches that's well under a
// minute, and it's fire-and-forget from the route. Re-runnable safely
// (each match's events are DELETE+INSERT).
export async function resyncPlayedMatchEvents(apiKey: string): Promise<void> {
  const played = await sql<{ match_id: string }[]>`
    SELECT match_id FROM public.live_matches
     WHERE home_score IS NOT NULL AND away_score IS NOT NULL
       AND NOT manual_override
     ORDER BY match_date ASC
  `;
  console.log(`[resync-events] starting for ${played.length} played matches`);
  let ok = 0;
  for (const { match_id } of played) {
    const apiId = match_id.replace(/^fd-/, "");
    try {
      const res = await fetch(`${FOOTBALL_API_BASE}/matches/${apiId}`, {
        headers: { "X-Auth-Token": apiKey },
      });
      if (res.ok) {
        const detail = (await res.json()) as FootballDataMatch;
        await syncGoalsFromFD(match_id, detail);
        await syncBookingsFromFD(match_id, detail);
        const enriched = await fetchMatchWithGoals(match_id);
        if (enriched) emitMatchEvent(enriched);
        ok++;
      } else {
        console.warn(`[resync-events] ${match_id} detail returned ${res.status}`);
      }
    } catch (err) {
      console.error(`[resync-events] ${match_id} failed:`, err);
    }
    await new Promise((r) => setTimeout(r, 7000));
  }
  console.log(`[resync-events] done: ${ok}/${played.length} resynced`);
}

// Fire a background sync if (a) the teams table is empty, or (b) the newest
// row is older than STALE_AFTER_MS. Called from public routes like GET
// /api/wc2026/teams so the app self-heals on first load without requiring
// an admin to hit the sync button. No-op when a sync is already running or
// data is fresh.
const STALE_AFTER_MS = 6 * 60 * 60 * 1000;  // 6 hours

export async function maybeTriggerBackgroundSync(
  rows: Array<{ updated_at: string | Date }>
): Promise<void> {
  if (syncState.status === "running") return;
  if (!process.env.FOOTBALL_DATA_API_KEY) return;

  const newest = rows
    .map((r) => new Date(r.updated_at).getTime())
    .filter((t) => !Number.isNaN(t))
    .sort((a, b) => b - a)[0];

  const isEmpty = rows.length === 0;
  const isStale = newest !== undefined && Date.now() - newest > STALE_AFTER_MS;

  if (!isEmpty && !isStale) return;

  console.log(
    `[sync-matches] auto-triggering (isEmpty=${isEmpty}, isStale=${isStale})`
  );
  setTimeout(() => {
    runSync(process.env.FOOTBALL_DATA_API_KEY!).catch((err) =>
      console.error("[sync-matches] auto-trigger failed:", err)
    );
  }, 0);
}

// -----------------------------------------------------------------------------
// Server-side sync scheduler.
//
// One 60s loop per server process replaces the per-browser 60s interval the
// frontend used to run. Each tick does a cheap LIMIT 1 existence check and
// only runs the (expensive, FD-rate-limited) full sync when something is
// actually happening:
//
//   - a live_matches row is live right now (IN_PLAY / PAUSED — plus LIVE,
//     which the frontend already treats as live, see LIVE_STATUSES in
//     src/contexts/LiveMatchesContext.tsx), OR
//   - a not-yet-finished match's scheduled kickoff is imminent or recent
//     (-5m … +20m around match_date). This solves the bootstrap problem:
//     the DB status only flips SCHEDULED/TIMED → IN_PLAY *via* a sync, so
//     without the kickoff window the live-status check alone would never
//     trigger the first sync of the day. 20 minutes past kickoff is ample
//     for the first tick to land and flip the status, after which the
//     live-status branch keeps the loop going through ET and penalties.
//
// Guards: ticks never overlap (in-flight flag + runSync's own "running"
// state), and any failure is logged, never thrown — a flaky FD response
// must not crash the server.
// -----------------------------------------------------------------------------

const SCHEDULER_INTERVAL_MS = 60_000;
const LIVE_STATUSES = ["IN_PLAY", "PAUSED", "LIVE"];

let schedulerTickInFlight = false;
let schedulerTimer: ReturnType<typeof setInterval> | null = null;

async function syncIsWarranted(): Promise<boolean> {
  const rows = await sql`
    SELECT 1
    FROM public.live_matches
    WHERE status IN ${sql(LIVE_STATUSES)}
       OR (
         status NOT IN ('FINISHED', 'AWARDED', 'CANCELLED', 'POSTPONED', 'SUSPENDED')
         AND match_date BETWEEN NOW() - INTERVAL '20 minutes'
                            AND NOW() + INTERVAL '5 minutes'
       )
    LIMIT 1
  `;
  return rows.length > 0;
}

async function schedulerTick(): Promise<void> {
  // Never overlap: skip the tick if the previous one (or a manually
  // triggered sync) is still running. The next tick re-checks.
  if (schedulerTickInFlight || syncState.status === "running") return;
  const apiKey = process.env.FOOTBALL_DATA_API_KEY;
  if (!apiKey) return;

  schedulerTickInFlight = true;
  try {
    if (await syncIsWarranted()) {
      console.log("[sync-scheduler] live/kickoff-window match found — running sync");
      // runSync never throws (it catches internally into syncState), but
      // belt-and-braces: the outer catch below guarantees the scheduler
      // survives anyway.
      await runSync(apiKey);
    }
  } catch (err) {
    console.error("[sync-scheduler] tick failed:", err);
  } finally {
    schedulerTickInFlight = false;
  }
}

// Idempotent — calling twice doesn't double the interval (matters under
// hot-reload in dev).
export function startMatchSyncScheduler(): void {
  if (schedulerTimer) return;
  if (!process.env.FOOTBALL_DATA_API_KEY) {
    console.warn("[sync-scheduler] FOOTBALL_DATA_API_KEY not set — scheduler idle");
  }
  schedulerTimer = setInterval(() => {
    void schedulerTick();
  }, SCHEDULER_INTERVAL_MS);
  console.log(`[sync-scheduler] started (every ${SCHEDULER_INTERVAL_MS / 1000}s)`);
}
