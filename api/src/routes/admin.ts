import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { sql } from "../db";
import { requireAdmin, requireAuth, type AuthEnv } from "../auth/middleware";
import { emitMatchEvent, type MatchGoal } from "../lib/matchEvents";
import { fetchMatchWithGoals, runSync, syncState, resyncPlayedMatchEvents } from "../lib/matchSync";
import { getActiveCompetitions, getCompetitionBySlug, invalidateCompetitionsCache, WC_COMPETITION_ID } from "../lib/competitions";
import { invalidateLeaderboardCache } from "./leaderboard";

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
    // Target-less ON CONFLICT works under both unique-constraint regimes
    // (global tla now; composite (competition_id, tla) after Phase C).
    await sql`
      INSERT INTO public.teams (tla, name, fd_team_id, competition_id)
      VALUES ('ZZT', 'Zz Test', -1, ${WC_COMPETITION_ID})
      ON CONFLICT DO NOTHING
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
        INSERT INTO public.teams (tla, name, fd_team_id, competition_id)
        VALUES ('ZZB', 'Zz Bg Test', -2, ${WC_COMPETITION_ID})
        ON CONFLICT DO NOTHING
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
// The sync machinery (runSync, syncState, goal/booking bulk sync, the
// boot-time scheduler) lives in ../lib/matchSync.ts. This route is just the
// manual trigger; during live play the server-side 60s scheduler started
// from index.ts drives syncs — clients no longer poll this endpoint.
// -----------------------------------------------------------------------------

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

  // ?competition=<slug> targets one competition (admin bootstrap of a new
  // season, forced teams refresh). Without it: every active competition,
  // sequentially — the multi-competition equivalent of the old behavior.
  const slug = c.req.query("competition");
  let comps;
  if (slug) {
    const comp = await getCompetitionBySlug(slug);
    if (!comp) return c.json({ error: `Unknown competition '${slug}'` }, 404);
    comps = [comp];
  } else {
    comps = await getActiveCompetitions();
    if (comps.length === 0) {
      return c.json({ error: "No active competitions to sync" }, 409);
    }
  }

  // Fire and forget via setTimeout — decouples from the request handler's
  // microtask queue so the work survives the response being sent. Envoy's
  // 10s upstream timeout is irrelevant because we've already responded.
  setTimeout(async () => {
    for (const comp of comps) {
      // Explicit trigger implies "refresh everything", including rosters.
      await runSync(apiKey, comp, { forceTeams: true }).catch((err) =>
        console.error(`[sync-matches] ${comp.slug} unhandled:`, err),
      );
    }
  }, 0);

  return c.json(
    { status: "started", competitions: comps.map((x) => x.slug), startedAt: new Date().toISOString() },
    202,
  );
});

// Sync status is also useful for the admin to see progress, but no reason
// regular users shouldn't see it either — it's just job state.
router.get("/sync-status", requireAuth, async (c) => {
  return c.json(syncState);
});

// One-off / occasional admin action: re-pull goals + bookings for every
// played match, ignoring the scheduler's 12h window. Use after an event-
// derivation change (e.g. the own-goal side-flip fix) so historical
// finished matches get rewritten. Admin-only and fire-and-forget; safe to
// re-run.
router.post("/resync-events", requireAdmin, async (c) => {
  const apiKey = process.env.FOOTBALL_DATA_API_KEY;
  if (!apiKey) return c.json({ error: "FOOTBALL_DATA_API_KEY not configured" }, 500);
  // Optional ?competition=<slug> scopes the (FD-budget-hungry) re-pull.
  const slug = c.req.query("competition");
  let competitionId: string | undefined;
  if (slug) {
    const comp = await getCompetitionBySlug(slug);
    if (!comp) return c.json({ error: `Unknown competition '${slug}'` }, 404);
    competitionId = comp.id;
  }
  setTimeout(() => {
    resyncPlayedMatchEvents(apiKey, competitionId).catch((err) =>
      console.error("[resync-events] unhandled:", err)
    );
  }, 0);
  return c.json({ status: "started", startedAt: new Date().toISOString() }, 202);
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
  // Penalty-shootout result — used to display "Spain win 5-4 on
  // pens" beneath the AET score. Doesn't enter the scoring math.
  // Same null-vs-undefined semantics as home_score/away_score.
  penalty_home_score: z.number().int().min(0).nullable().optional(),
  penalty_away_score: z.number().int().min(0).nullable().optional(),
  // Match duration. Constrained to FD's enum values so a typo
  // doesn't slip into the DB and confuse the badge-rendering logic
  // on the frontend.
  duration: z.enum(["REGULAR", "EXTRA_TIME", "PENALTY_SHOOTOUT"]).nullable().optional(),
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
    if (has("penalty_home_score")) bind("penalty_home_score", body.penalty_home_score);
    if (has("penalty_away_score")) bind("penalty_away_score", body.penalty_away_score);
    if (has("duration"))       bind("duration",       body.duration);
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
    // An admin score correction must show in standings immediately, not
    // after the leaderboard cache's TTL. The FD sync path doesn't bother —
    // 15s staleness is fine for organic score changes.
    invalidateLeaderboardCache();
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
        match_id, competition_id, home_team_name, home_team_code, away_team_name, away_team_code,
        match_date, venue, stage, group_name, status, last_updated
      ) VALUES (
        ${`DEMO-${m.g}-${m.hc}-${m.ac}`},
        ${WC_COMPETITION_ID},
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
// POST /admin/generate-boost-image
//
// Two providers, in order:
//   1. Google Gemini's image model — best quality when it works.
//   2. Pollinations.ai — free, no API key, no quota. Reliable fallback.
//
// Gemini's free tier has limit=0 for image models (paid-only), and we
// don't have billing wired. Until that changes we'll usually fall through
// to Pollinations — but the structure means a future billing change just
// works without code changes.
//
// In both cases the resulting image is fetched server-side, base64-encoded,
// and stored as a data: URL on the boost row. Keeps everything in one
// place (no external image hosting), and the image survives even if the
// upstream provider goes down later.
// -----------------------------------------------------------------------------

async function tryGeminiImage(
  prompt: string,
  apiKey: string,
): Promise<string | null> {
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { responseModalities: ["IMAGE"] },
        }),
      },
    );
    if (!res.ok) {
      const txt = (await res.text()).slice(0, 200);
      console.warn(`[boost-image] Gemini ${res.status}: ${txt}`);
      return null;
    }
    const data = (await res.json()) as {
      candidates?: Array<{
        content?: { parts?: Array<{ inlineData?: { mimeType: string; data: string } }> };
      }>;
    };
    const part = data.candidates?.[0]?.content?.parts?.find((p) => p.inlineData);
    const b64 = part?.inlineData?.data;
    const mime = part?.inlineData?.mimeType ?? "image/png";
    return b64 ? `data:${mime};base64,${b64}` : null;
  } catch (err) {
    console.warn("[boost-image] Gemini threw:", err);
    return null;
  }
}

async function tryPollinationsImage(prompt: string): Promise<string | null> {
  try {
    // nologo=true strips the bottom-right Pollinations watermark. seed is
    // randomised per request so you don't get the same image on a duplicate
    // boost title. width/height fixed at 768x768 — boost cards are square.
    const seed = Math.floor(Math.random() * 1_000_000);
    const url =
      `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}` +
      `?width=768&height=768&nologo=true&seed=${seed}`;
    const res = await fetch(url);
    if (!res.ok) {
      console.warn(`[boost-image] Pollinations ${res.status}`);
      return null;
    }
    const buf = await res.arrayBuffer();
    const mime = res.headers.get("content-type") ?? "image/jpeg";
    const b64 = Buffer.from(buf).toString("base64");
    return `data:${mime};base64,${b64}`;
  } catch (err) {
    console.warn("[boost-image] Pollinations threw:", err);
    return null;
  }
}

router.post(
  "/generate-boost-image",
  requireAdmin,
  zValidator(
    "json",
    z.object({
      boostId: z.string().uuid(),
      title: z.string(),
      description: z.string().optional(),
    }),
  ),
  async (c) => {
    const body = c.req.valid("json");

    const prompt = `A vivid, eye-catching sports prediction image for a football boost award. Title: "${body.title}"${body.description ? `. Description: "${body.description}"` : ""}. Style: modern, energetic, football/soccer themed, vibrant colours. NO text, NO logos, NO national flags, NO team kits, NO FIFA branding, NO mascots.`;

    const apiKey = process.env.GOOGLE_AI_API_KEY;
    let imageUrl: string | null = null;

    if (apiKey) {
      imageUrl = await tryGeminiImage(prompt, apiKey);
    }
    if (!imageUrl) {
      imageUrl = await tryPollinationsImage(prompt);
    }

    if (!imageUrl) {
      return c.json({ error: "All image providers failed — please try again" }, 502);
    }

    await sql`
      UPDATE tenant_custom_boosts SET image_url = ${imageUrl}, updated_at = NOW()
      WHERE id = ${body.boostId}
    `;

    return c.json({ imageUrl });
  },
);

export default router;
