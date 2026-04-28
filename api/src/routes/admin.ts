import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { sql } from "../db";
import { requireAdmin, requireAuth, type AuthEnv } from "../auth/middleware";
import { emitMatchEvent, type LiveMatchEvent, type MatchGoal } from "../lib/matchEvents";

// Re-fetch the full live_matches row + its goals for SSE emission. Used
// from any code path that mutates either the match itself OR its goal
// list, so subscribers always see the freshest state without separately
// listening for "match changed" vs "goals changed" event types.
async function fetchMatchWithGoals(matchId: string): Promise<LiveMatchEvent | null> {
  const rows = await sql`
    SELECT lm.*,
      COALESCE(
        json_agg(
          json_build_object(
            'id', mg.id,
            'minute', mg.minute,
            'player_name', mg.player_name,
            'team_side', mg.team_side
          ) ORDER BY mg.minute, mg.created_at
        ) FILTER (WHERE mg.id IS NOT NULL),
        '[]'::json
      ) AS goals
    FROM public.live_matches lm
    LEFT JOIN public.match_goals mg ON mg.match_id = lm.match_id
    WHERE lm.match_id = ${matchId}
    GROUP BY lm.match_id
  `;
  return rows.length === 0 ? null : (rows[0] as unknown as LiveMatchEvent);
}

const router = new Hono<AuthEnv>();

router.delete("/users/:userId", requireAdmin, async (c) => {
  const userId = c.req.param("userId");
  await sql`DELETE FROM public.users WHERE id = ${userId}`;
  return c.json({ ok: true });
});

// Diagnostic: does a single INSERT into teams work inside a request handler?
// Establishes a baseline before we blame the background-task path.
router.post("/test-insert", requireAdmin, async (c) => {
  console.error("[test-insert] starting");
  try {
    await sql`
      INSERT INTO public.teams (tla, name, fd_team_id)
      VALUES ('ZZT', 'Zz Test', -1)
      ON CONFLICT (tla) DO UPDATE SET updated_at = NOW()
    `;
    const rows = (await sql`SELECT COUNT(*)::int AS n FROM public.teams`) as unknown as { n: number }[];
    console.error("[test-insert] done, count =", rows[0]?.n);
    return c.json({ ok: true, count: rows[0]?.n ?? 0 });
  } catch (err) {
    console.error("[test-insert] error:", err);
    return c.json({ error: String(err) }, 500);
  }
});

// Diagnostic: does the same INSERT work when fired via setTimeout
// (i.e. after the request handler has returned)?
// Writes result to a module-level holder that /admin/test-bg-status reads.
let bgTestState: { started?: string; finished?: string; count?: number; error?: string } = {};
router.post("/test-bg", requireAdmin, async (c) => {
  bgTestState = { started: new Date().toISOString() };
  setTimeout(async () => {
    console.error("[test-bg] starting background work");
    try {
      await sql`
        INSERT INTO public.teams (tla, name, fd_team_id)
        VALUES ('ZZB', 'Zz Bg Test', -2)
        ON CONFLICT (tla) DO UPDATE SET updated_at = NOW()
      `;
      const rows = (await sql`SELECT COUNT(*)::int AS n FROM public.teams`) as unknown as { n: number }[];
      bgTestState.finished = new Date().toISOString();
      bgTestState.count = rows[0]?.n;
      console.error("[test-bg] done, count =", rows[0]?.n);
    } catch (err) {
      bgTestState.finished = new Date().toISOString();
      bgTestState.error = String(err);
      console.error("[test-bg] error:", err);
    }
  }, 0);
  return c.json({ status: "started" }, 202);
});

router.get("/test-bg-status", requireAdmin, async (c) => c.json(bgTestState));

// -----------------------------------------------------------------------------
// POST /admin/sync-matches
// Fetches WC 2026 fixtures from Football-Data.org and upserts into live_matches.
// Ported from supabase/functions/sync-matches/index.ts.
// -----------------------------------------------------------------------------

const FOOTBALL_API_BASE = "https://api.football-data.org/v4";
const COMPETITION_CODE = "WC";

interface FootballDataMatch {
  id: number;
  utcDate: string;
  status: string;
  matchday: number;
  stage: string;
  group: string | null;
  homeTeam: { id: number; name: string; shortName: string; tla: string };
  awayTeam: { id: number; name: string; shortName: string; tla: string };
  score: { fullTime: { home: number | null; away: number | null } };
  venue: string | null;
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
// finalises the roster (post-playoffs, post-March 2026).
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
interface SyncState {
  status: "idle" | "running" | "success" | "failed";
  startedAt: string | null;
  finishedAt: string | null;
  matchesUpdated: number;
  teamsUpdated: number;
  totalMatches: number;
  error: string | null;
}
const syncState: SyncState = {
  status: "idle",
  startedAt: null,
  finishedAt: null,
  matchesUpdated: 0,
  teamsUpdated: 0,
  totalMatches: 0,
  error: null,
};

async function runSync(apiKey: string): Promise<void> {
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
        const upserted = await sql`
          INSERT INTO public.live_matches (
            match_id, api_match_id, home_team_name, home_team_code,
            away_team_name, away_team_code, home_score, away_score,
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
          const enriched = await fetchMatchWithGoals((upserted[0] as { match_id: string }).match_id);
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
          syncState.teamsUpdated++;
        } catch (err) {
          console.error(`[sync-matches] team ${team.tla} failed:`, err);
        }
      }
      console.log(`[sync-matches] teams done: ${syncState.teamsUpdated}/${teams.length}`);
    }

    // Pull in non-WC test fixtures (Bayern vs PSG, etc) so they get
    // refreshed on every sync — without this, live scores from the
    // CL feed never make it into our DB. Failures are isolated; a
    // broken extra-match must not fail the WC sync.
    try {
      await syncExtraMatches(apiKey);
    } catch (err) {
      console.error("[sync-matches] extra-matches failed:", err);
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

// -----------------------------------------------------------------------------
// EXTRA MATCHES — non-WC fixtures we want to surface inside the WC app for
// testing the live-score push pipeline before the World Cup opens.
//
// Each entry pulls from a different FD competition (free tier supports CL,
// PL, BL1, etc.) and is upserted into live_matches with stage/group_name
// overrides so it appears in the WC group view. Match-id is namespaced by
// competition code (`fd-cl-{id}`, `fd-pl-{id}`) so it can never collide
// with the regular `fd-{id}` rows that runSync writes for the WC feed.
//
// Remove this block (plus the call inside runSync below) once the
// tournament starts and we don't need a stand-in live match.
// -----------------------------------------------------------------------------

interface ExtraMatchSpec {
  competition: string;          // FD competition code (CL, PL, …)
  // Stable match_id we write to live_matches. Hardcoded per spec rather
  // than derived from FD's match.id so updates always land on the same
  // row even if the predicate resolves to a different FD match over time
  // (e.g. group stage → knockout once the earlier fixture has finished).
  matchId: string;
  pickFrom: (matches: FootballDataMatch[]) => FootballDataMatch | null;
  stage: string;                // our internal stage
  groupName: string | null;     // our internal group_name
  label: string;                // for logs
}

const FINISHED_STATUSES = new Set(['FINISHED', 'CANCELLED', 'POSTPONED', 'SUSPENDED', 'AWARDED']);

// Helper: build a "next non-finished UCL match between two teams" picker.
// Same shape used by every CL test entry — match by team-name keywords,
// drop already-played, take earliest by kickoff.
function clPicker(
  homeKeyword: string,
  awayKeyword: string,
): (matches: FootballDataMatch[]) => FootballDataMatch | null {
  const has = (s: string | undefined, kw: string) =>
    (s ?? '').toLowerCase().includes(kw.toLowerCase());
  return (matches) => {
    const candidates = matches.filter((m) => {
      const home = m.homeTeam?.name;
      const away = m.awayTeam?.name;
      const isFixture =
        (has(home, homeKeyword) && has(away, awayKeyword)) ||
        (has(home, awayKeyword) && has(away, homeKeyword));
      return isFixture && !FINISHED_STATUSES.has(m.status);
    });
    candidates.sort(
      (a, b) => new Date(a.utcDate).getTime() - new Date(b.utcDate).getTime(),
    );
    return candidates[0] ?? null;
  };
}

const EXTRA_MATCHES: ExtraMatchSpec[] = [
  {
    competition: 'CL',
    matchId: 'extra-cl-bayern-psg',
    label: 'Bayern vs PSG (UCL semi)',
    stage: 'group',
    groupName: 'A',
    pickFrom: clPicker('bayern', 'paris'),
  },
  {
    competition: 'CL',
    matchId: 'extra-cl-arsenal-atletico',
    label: 'Arsenal vs Atletico Madrid (UCL semi)',
    stage: 'group',
    groupName: 'A',
    // FD's name is "Club Atlético de Madrid" — matching on "atlético" with
    // accent would break in-place toLowerCase; "atletico" alone might
    // catch other clubs. Keyword "madrid" is unique to this fixture in
    // the CL feed (Real Madrid is out of the semis).
    pickFrom: clPicker('arsenal', 'madrid'),
  },
];

async function syncExtraMatches(apiKey: string): Promise<void> {
  // One-time cleanup: an earlier version of this code derived match_id
  // from the FD match.id (`fd-cl-<id>`), which left an orphan row whenever
  // the predicate later resolved to a different match. Stable IDs make
  // this a no-op going forward, but we still need to nuke any legacy
  // rows so the user's Group A list doesn't show a stale FT result
  // alongside the live semi.
  await sql`
    DELETE FROM public.live_matches
     WHERE match_id LIKE 'fd-cl-%' OR match_id LIKE 'fd-pl-%'
  `;

  for (const spec of EXTRA_MATCHES) {
    try {
      const res = await fetch(
        `${FOOTBALL_API_BASE}/competitions/${spec.competition}/matches`,
        { headers: { 'X-Auth-Token': apiKey } },
      );
      if (!res.ok) {
        console.warn(`[extra-matches] ${spec.label}: ${spec.competition} returned ${res.status}`);
        continue;
      }
      const data = (await res.json()) as { matches?: FootballDataMatch[] };
      const found = spec.pickFrom(data.matches ?? []);
      if (!found) {
        console.warn(`[extra-matches] ${spec.label}: no upcoming/live fixture found in ${spec.competition} feed`);
        continue;
      }

      // FD returns names like "FC Bayern München" / "Paris Saint-Germain FC"
      // that always truncate in the MatchCard's 96px team-name pill. Override
      // to a short form keyed by TLA so the user sees "Bayern" / "PSG" in
      // full — purely a display concern; the FD data itself is unchanged.
      const SHORT_NAME: Record<string, string> = {
        FCB: 'Bayern',
        PSG: 'PSG',
        ARS: 'Arsenal',
        ATM: 'Atlético',
      };
      const displayName = (t: FootballDataMatch['homeTeam']): string =>
        SHORT_NAME[t?.tla ?? ''] ?? t?.shortName ?? t?.name ?? t?.tla ?? 'TBD';

      // Upsert teams so useTeams returns them (with crests + group)
      // alongside the regular WC roster. group is our overridden value,
      // not the FD competition group.
      for (const t of [found.homeTeam, found.awayTeam]) {
        if (!t?.tla) continue;
        const name = displayName(t);
        await sql`
          INSERT INTO public.teams (id, tla, name, short_name, crest_url, group_name, fd_team_id, updated_at)
          VALUES (
            gen_random_uuid(),
            ${t.tla},
            ${name},
            ${name},
            ${(t as { crest?: string }).crest ?? null},
            ${spec.groupName},
            ${t.id ?? null},
            NOW()
          )
          ON CONFLICT (tla) DO UPDATE SET
            name = EXCLUDED.name,
            short_name = EXCLUDED.short_name,
            crest_url = EXCLUDED.crest_url,
            group_name = EXCLUDED.group_name,
            fd_team_id = EXCLUDED.fd_team_id,
            updated_at = NOW()
        `;
      }

      const matchId = spec.matchId;
      const upserted = await sql`
        INSERT INTO public.live_matches (
          match_id, api_match_id, home_team_name, home_team_code,
          away_team_name, away_team_code, home_score, away_score,
          match_date, venue, city, stage, group_name, status, last_updated
        ) VALUES (
          ${matchId},
          ${found.id ?? null},
          ${displayName(found.homeTeam)},
          ${found.homeTeam?.tla ?? 'TBD'},
          ${displayName(found.awayTeam)},
          ${found.awayTeam?.tla ?? 'TBD'},
          ${found.score?.fullTime?.home ?? null},
          ${found.score?.fullTime?.away ?? null},
          ${found.utcDate ?? null},
          ${found.venue ?? null},
          ${null},
          ${spec.stage},
          ${spec.groupName},
          ${found.status ?? 'SCHEDULED'},
          NOW()
        )
        ON CONFLICT (match_id) DO UPDATE SET
          api_match_id   = EXCLUDED.api_match_id,
          home_team_name = EXCLUDED.home_team_name,
          home_team_code = EXCLUDED.home_team_code,
          away_team_name = EXCLUDED.away_team_name,
          away_team_code = EXCLUDED.away_team_code,
          home_score     = EXCLUDED.home_score,
          away_score     = EXCLUDED.away_score,
          match_date     = EXCLUDED.match_date,
          venue          = EXCLUDED.venue,
          status         = EXCLUDED.status,
          last_updated   = NOW()
        WHERE NOT public.live_matches.manual_override
        RETURNING *
      `;
      // Same emit policy as runSync's main loop: only push to SSE when
      // the row actually changed.
      if (upserted && upserted.length > 0) {
        const enriched = await fetchMatchWithGoals(matchId);
        if (enriched) emitMatchEvent(enriched);
      }
      console.log(
        `[extra-matches] ${spec.label}: ${found.status} ${found.homeTeam?.tla ?? '?'} ${found.score?.fullTime?.home ?? '-'} – ${found.score?.fullTime?.away ?? '-'} ${found.awayTeam?.tla ?? '?'}`,
      );
    } catch (err) {
      console.error(`[extra-matches] ${spec.label} failed:`, err);
    }
  }
}

// POST /admin/sync-matches — open to any authenticated tenant user, not
// just admins. Match score refresh is safe to expose: the action is
// idempotent (UPSERT on stable football-data.org match ids), the
// in-memory `syncState.status === "running"` guard collapses concurrent
// requests into one, and football-data.org's own rate limit caps abuse.
// Was previously gated behind requireAdmin, which 403'd every regular
// tenant user when useLiveMatches auto-fired this on the matches view.
router.post("/sync-matches", requireAuth, async (c) => {
  const apiKey = process.env.FOOTBALL_DATA_API_KEY;
  if (!apiKey) return c.json({ error: "FOOTBALL_DATA_API_KEY not configured" }, 500);

  // Don't kick off a second concurrent sync.
  if (syncState.status === "running") {
    return c.json({ status: "running", startedAt: syncState.startedAt }, 202);
  }

  // Fire and forget via setTimeout — decouples from the request handler's
  // microtask queue so the work survives the response being sent. Envoy's
  // 10s upstream timeout is irrelevant because we've already responded.
  setTimeout(() => {
    runSync(apiKey).catch((err) => console.error("[sync-matches] unhandled:", err));
  }, 0);

  return c.json({ status: "started", startedAt: new Date().toISOString() }, 202);
});

// Sync status is also useful for the admin to see progress, but no reason
// regular users shouldn't see it either — it's just job state.
router.get("/sync-status", requireAuth, async (c) => {
  return c.json(syncState);
});

// -----------------------------------------------------------------------------
// Manual match override — backstop when football-data.org's data is wrong,
// missing, or offline. Admin can edit any field and the row is locked from
// future syncs (runSync's UPSERT respects manual_override). Releases the lock
// via DELETE so sync can take over again.
//
// Scoring (routes/leaderboard.ts) keys off home_score/away_score being
// non-null and ignores status, so manual edits flow through scoring with no
// further plumbing.
// -----------------------------------------------------------------------------

router.get("/matches", requireAdmin, async (c) => {
  const rows = await sql`
    SELECT * FROM public.live_matches ORDER BY match_date ASC
  `;
  return c.json(rows);
});

const matchPatchSchema = z.object({
  home_team_name: z.string().min(1).max(64).optional(),
  home_team_code: z.string().min(2).max(8).optional(),
  away_team_name: z.string().min(1).max(64).optional(),
  away_team_code: z.string().min(2).max(8).optional(),
  // null is a meaningful state for scores: "match has no recorded result yet".
  // Differentiate from undefined (= field not in body, leave alone).
  home_score: z.number().int().nullable().optional(),
  away_score: z.number().int().nullable().optional(),
  match_date: z.string().datetime().optional(),
  venue: z.string().max(128).nullable().optional(),
  city: z.string().max(64).nullable().optional(),
  stage: z.string().max(32).optional(),
  group_name: z.string().max(8).nullable().optional(),
  status: z.string().max(32).optional(),
}).strict();

router.patch(
  "/matches/:matchId",
  requireAdmin,
  zValidator("json", matchPatchSchema),
  async (c) => {
    const matchId = c.req.param("matchId");
    const body = c.req.valid("json");

    // postgres.js tagged templates don't support a dynamic SET clause
    // (each ${} produces a single bound parameter, not a fragment of SQL).
    // Build the SET list as a parameterised raw query so admin can PATCH
    // any subset of fields. Column names are a fixed allowlist — never
    // user input — so concatenation here can't introduce injection. Values
    // bind through sql.unsafe's positional-parameter array.
    const setFragments: string[] = [];
    const values: unknown[] = [];
    const bind = (col: string, val: unknown) => {
      values.push(val);
      setFragments.push(`${col} = $${values.length}`);
    };

    const has = (k: keyof typeof body) =>
      Object.prototype.hasOwnProperty.call(body, k);

    if (has("home_team_name")) bind("home_team_name", body.home_team_name);
    if (has("home_team_code")) bind("home_team_code", body.home_team_code);
    if (has("away_team_name")) bind("away_team_name", body.away_team_name);
    if (has("away_team_code")) bind("away_team_code", body.away_team_code);
    if (has("home_score"))     bind("home_score",     body.home_score);
    if (has("away_score"))     bind("away_score",     body.away_score);
    if (has("match_date"))     bind("match_date",     body.match_date);
    if (has("venue"))          bind("venue",          body.venue);
    if (has("city"))           bind("city",           body.city);
    if (has("stage"))          bind("stage",          body.stage);
    if (has("group_name"))     bind("group_name",     body.group_name);
    if (has("status"))         bind("status",         body.status);

    // Always set these on any admin PATCH. Toggling override on a
    // body-less PATCH is fine — touches just these two columns.
    setFragments.push(`manual_override = true`);
    setFragments.push(`last_updated = NOW()`);

    values.push(matchId);
    const matchIdParam = `$${values.length}`;

    const updated = await sql.unsafe(
      `UPDATE public.live_matches
         SET ${setFragments.join(", ")}
       WHERE match_id = ${matchIdParam}
       RETURNING *`,
      values as never[]
    );

    if (!updated || updated.length === 0) {
      return c.json({ error: "Match not found" }, 404);
    }
    // Push to any SSE subscribers so live UIs reflect this edit immediately
    // — no refresh required. fetchMatchWithGoals re-reads the row so the
    // emission carries the joined goals list, not just the bare match cols.
    const enriched = await fetchMatchWithGoals(matchId);
    if (enriched) emitMatchEvent(enriched);
    return c.json(updated[0]);
  }
);

// -----------------------------------------------------------------------------
// Goal scorers — manual entry, since FD's tier we're on doesn't return
// per-goal events. Surface scorer + minute on the MatchCard same as
// Sofascore/Flashscore would. SSE emits a match-update with the refreshed
// goals list so any open client repaints in real time.
// -----------------------------------------------------------------------------

const goalSchema = z.object({
  minute: z.number().int().min(1).max(130),
  player_name: z.string().min(1).max(64),
  team_side: z.enum(['home', 'away']),
});

router.post(
  "/matches/:matchId/goals",
  requireAdmin,
  zValidator("json", goalSchema),
  async (c) => {
    const matchId = c.req.param("matchId");
    const body = c.req.valid("json");

    // Verify the match exists first so we return 404, not a foreign-key
    // violation, when the URL has a typo'd id.
    const match = await sql`
      SELECT 1 FROM public.live_matches WHERE match_id = ${matchId} LIMIT 1
    `;
    if (match.length === 0) return c.json({ error: "Match not found" }, 404);

    const inserted = await sql`
      INSERT INTO public.match_goals (match_id, minute, player_name, team_side)
      VALUES (${matchId}, ${body.minute}, ${body.player_name}, ${body.team_side})
      RETURNING *
    `;

    // Refresh the match row + goals and emit so live clients see the new
    // scorer immediately. Same emit pipe as a score-edit PATCH.
    const enriched = await fetchMatchWithGoals(matchId);
    if (enriched) emitMatchEvent(enriched);

    return c.json(inserted[0] as unknown as MatchGoal, 201);
  },
);

router.delete("/matches/:matchId/goals/:goalId", requireAdmin, async (c) => {
  const matchId = c.req.param("matchId");
  const goalId = c.req.param("goalId");

  const deleted = await sql`
    DELETE FROM public.match_goals
     WHERE id = ${goalId} AND match_id = ${matchId}
    RETURNING *
  `;
  if (deleted.length === 0) return c.json({ error: "Goal not found" }, 404);

  const enriched = await fetchMatchWithGoals(matchId);
  if (enriched) emitMatchEvent(enriched);

  return c.json({ ok: true });
});

// POST /admin/seed-extra-matches — runs ONLY the extra-match fetch (no WC).
// Useful for seeding a CL test match in seconds without waiting for the full
// 104-match WC sync, and for manually nudging the CL refresh during a live
// game without taking the WC sync's cooldown.
router.post("/seed-extra-matches", requireAdmin, async (c) => {
  const apiKey = process.env.FOOTBALL_DATA_API_KEY;
  if (!apiKey) return c.json({ error: "FOOTBALL_DATA_API_KEY not configured" }, 500);
  await syncExtraMatches(apiKey);
  return c.json({ ok: true, count: EXTRA_MATCHES.length });
});

router.delete("/matches/:matchId/override", requireAdmin, async (c) => {
  const matchId = c.req.param("matchId");
  const rows = await sql`
    UPDATE public.live_matches
       SET manual_override = false,
           last_updated = NOW()
     WHERE match_id = ${matchId}
    RETURNING *
  `;
  if (rows.length === 0) return c.json({ error: "Match not found" }, 404);
  // Tell live clients the lock dropped so the UI can update accordingly.
  // The follow-up sync (admin's "Release & sync" action) will emit a
  // second event with the FD values that overwrote the manual ones.
  const enriched = await fetchMatchWithGoals(matchId);
  if (enriched) emitMatchEvent(enriched);
  return c.json(rows[0]);
});

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
// POST /admin/seed-demo-matches
// Seeds a handful of plausible WC 2026 group-stage matches so the app has
// something to render while the official fixture list isn't available yet.
// -----------------------------------------------------------------------------
router.post("/seed-demo-matches", requireAdmin, async (c) => {
  // Base date: WC 2026 opens June 11 2026
  const d = (days: number, hour = 20) => {
    const date = new Date("2026-06-11T00:00:00Z");
    date.setUTCDate(date.getUTCDate() + days);
    date.setUTCHours(hour, 0, 0, 0);
    return date.toISOString();
  };
  const demo = [
    { home: "Mexico",       hc: "MEX", away: "Scotland",     ac: "SCO", g: "A", d: d(0, 20),  v: "Estadio Azteca, Mexico City" },
    { home: "Canada",       hc: "CAN", away: "Iceland",      ac: "ISL", g: "B", d: d(1, 16),  v: "BMO Field, Toronto" },
    { home: "United States",hc: "USA", away: "New Zealand",  ac: "NZL", g: "C", d: d(1, 20),  v: "SoFi Stadium, Los Angeles" },
    { home: "Brazil",       hc: "BRA", away: "Japan",        ac: "JPN", g: "D", d: d(2, 19),  v: "Lincoln Financial Field, Philadelphia" },
    { home: "Argentina",    hc: "ARG", away: "Morocco",      ac: "MAR", g: "E", d: d(3, 18),  v: "MetLife Stadium, New Jersey" },
    { home: "France",       hc: "FRA", away: "Australia",    ac: "AUS", g: "F", d: d(4, 17),  v: "AT&T Stadium, Dallas" },
    { home: "Spain",        hc: "ESP", away: "South Korea",  ac: "KOR", g: "G", d: d(5, 20),  v: "NRG Stadium, Houston" },
    { home: "England",      hc: "ENG", away: "Denmark",      ac: "DEN", g: "H", d: d(6, 15),  v: "Hard Rock Stadium, Miami" },
  ];

  let inserted = 0;
  for (const m of demo) {
    await sql`
      INSERT INTO public.live_matches (
        match_id, home_team_name, home_team_code, away_team_name, away_team_code,
        match_date, venue, stage, group_name, status, last_updated
      ) VALUES (
        ${`DEMO-${m.g}-${m.hc}-${m.ac}`},
        ${m.home}, ${m.hc}, ${m.away}, ${m.ac},
        ${m.d}, ${m.v}, 'group', ${m.g}, 'SCHEDULED', NOW()
      )
      ON CONFLICT (match_id) DO NOTHING
    `;
    inserted++;
  }

  return c.json({ message: "Demo matches seeded", inserted });
});

// -----------------------------------------------------------------------------
// POST /admin/generate-boost-image (unchanged)
// -----------------------------------------------------------------------------
router.post(
  "/generate-boost-image",
  requireAdmin,
  zValidator(
    "json",
    z.object({
      boostId: z.string().uuid(),
      title: z.string(),
      description: z.string().optional(),
    })
  ),
  async (c) => {
    const body = c.req.valid("json");
    const apiKey = process.env.GOOGLE_AI_API_KEY;
    if (!apiKey) return c.json({ error: "GOOGLE_AI_API_KEY not configured" }, 500);

    const prompt = `Generate a vivid, eye-catching sports prediction image for a World Cup 2026 boost award. Title: "${body.title}"${body.description ? `. Description: "${body.description}"` : ""}. Style: modern, energetic, football/soccer themed.`;

    // Imagen 4 requires a paid Gemini plan. gemini-2.5-flash-image is a
    // Gemini-native image model available on the free tier and uses the
    // standard generateContent API. Response returns an inline base64 image
    // in the candidates[].content.parts[] array alongside any text parts.
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            responseModalities: ["IMAGE"],
          },
        }),
      }
    );

    if (!res.ok) {
      const errText = await res.text();
      console.error("Gemini image API error:", errText);
      let msg = errText;
      try {
        const parsed = JSON.parse(errText);
        msg = parsed.error?.message || errText;
      } catch { /* not JSON */ }
      return c.json({ error: `Image generation failed: ${msg}` }, 502);
    }

    const data = (await res.json()) as {
      candidates?: Array<{
        content?: { parts?: Array<{ inlineData?: { mimeType: string; data: string } }> };
      }>;
    };
    const parts = data.candidates?.[0]?.content?.parts ?? [];
    const imagePart = parts.find((p) => p.inlineData);
    const b64 = imagePart?.inlineData?.data;
    const mime = imagePart?.inlineData?.mimeType ?? "image/png";
    if (!b64) {
      console.error("Gemini image API returned no inline image:", JSON.stringify(data).slice(0, 400));
      return c.json({ error: "No image returned" }, 502);
    }

    const imageUrl = `data:${mime};base64,${b64}`;

    await sql`
      UPDATE tenant_custom_boosts SET image_url = ${imageUrl}, updated_at = NOW()
      WHERE id = ${body.boostId}
    `;

    return c.json({ imageUrl });
  }
);

export default router;
