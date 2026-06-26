import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { sql } from "../db";
import { requireAuth, type AuthEnv } from "../auth/middleware";
import { subscribeMatchEvents } from "../lib/matchEvents";

const router = new Hono<AuthEnv>();

// GET /api/matches?stage=group|knockout
// Stage filter uses the normalised values sync-matches writes: 'group' for
// group-stage fixtures, anything else ('round16', 'quarter', 'semi', etc.)
// is considered knockout.
router.get("/", async (c) => {
  const stage = c.req.query("stage");
  // Goals as a correlated subquery in SELECT — avoids the GROUP BY trap
  // where Postgres demands every non-aggregate live_matches column appear
  // in the GROUP BY (live_matches.id is the PK, match_id is just unique,
  // so GROUP BY match_id alone fails on lm.* selection).
  // COALESCE → '[]' so the frontend's typed `row.goals.map(...)` is safe.
  const goalsSubquery = sql`COALESCE((
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
  ), '[]'::json)`;

  // Bookings (yellow/red cards), shown on the card alongside goals.
  const bookingsSubquery = sql`COALESCE((
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
  ), '[]'::json)`;

  let rows;
  if (stage === "group") {
    rows = await sql`
      SELECT lm.*, ${goalsSubquery} AS goals, ${bookingsSubquery} AS bookings
      FROM public.live_matches lm
      WHERE lm.stage = 'group'
      ORDER BY lm.match_date ASC
    `;
  } else if (stage === "knockout") {
    rows = await sql`
      SELECT lm.*, ${goalsSubquery} AS goals, ${bookingsSubquery} AS bookings
      FROM public.live_matches lm
      WHERE lm.stage <> 'group'
      ORDER BY lm.match_date ASC
    `;
  } else {
    rows = await sql`
      SELECT lm.*, ${goalsSubquery} AS goals, ${bookingsSubquery} AS bookings
      FROM public.live_matches lm
      ORDER BY lm.match_date ASC
    `;
  }
  // Tight cache (10s) — during live matches we want a refresh to pick up
  // a goal quickly. The SSE stream at /api/matches/stream pushes updates
  // for already-loaded clients; this cache only matters on first load /
  // hard refresh, where 10s of staleness is the worst case.
  c.header("Cache-Control", "public, max-age=10");
  return c.json(rows);
});

// GET /api/matches/stream
// Server-sent events: every time a row in live_matches is upserted (admin
// PATCH, DELETE-override, or runSync from football-data.org), the new row
// is pushed to all connected clients. Frontend merges by match_id so users
// see scores update without refreshing.
//
// No auth — same data is exposed via GET /api/matches. We may want to gate
// this once we know what the connection load looks like during a live game,
// but the read surface is identical.
router.get("/stream", async (c) => {
  // Disable proxy buffering. Envoy / nginx / Cloudflare honour this header
  // and won't hold the response until a buffer fills — critical for SSE,
  // where each event must reach the client immediately.
  c.header("X-Accel-Buffering", "no");

  return streamSSE(c, async (stream) => {
    // Send an immediate heartbeat. Some ingresses don't flush response
    // headers until the first bytes of body land — so without this the
    // browser's EventSource can stall in "connecting" state for up to 30s
    // until the first event happens. A two-byte SSE comment is enough.
    await stream.writeSSE({ event: "ready", data: "" });

    let id = 0;

    const unsubscribe = subscribeMatchEvents((event) => {
      // writeSSE is async but we don't await — the subscriber bus is
      // synchronous and a slow client must not block the fan-out.
      // streamSSE handles backpressure by buffering inside the
      // TransformStream; if the buffer overflows the connection drops
      // (which is the right outcome — the client will reconnect).
      stream.writeSSE({
        id: String(++id),
        event: "match-update",
        data: JSON.stringify(event),
      }).catch((err) => {
        console.error("[matches/stream] writeSSE failed:", err);
      });
    });

    // Heartbeat every 25s. Most ingress proxies (Cloudflare, Northflank's
    // Envoy) close idle TCP connections at 30-60s; a regular comment line
    // keeps the connection visibly alive without polluting the event log
    // on the client (clients get a `:heartbeat` comment, not an event).
    const heartbeat = setInterval(() => {
      stream.writeSSE({ event: "heartbeat", data: "" }).catch(() => {
        // On heartbeat write failure, the next subscriber dispatch will
        // also fail and we'll tear down via the abort handler. Nothing
        // useful to do here.
      });
    }, 25_000);

    stream.onAbort(() => {
      clearInterval(heartbeat);
      unsubscribe();
    });

    // Hold the stream open for the lifetime of the connection. streamSSE
    // closes the response when this callback resolves; we never resolve,
    // so the stream stays open until the client disconnects (which fires
    // onAbort above).
    await new Promise<void>(() => {});
  });
});

// ---------------------------------------------------------------------------
// GET /api/matches/:matchId/exact-predictions?tenant_id=<uuid>
// "Who called it" — the users in this tenant whose prediction matched the
// final score exactly. Powers the unfurling reveal on finished match cards.
//
// Privacy: revealed ONLY once the match is FINISHED with both scores set —
// before that we return { revealed: false } and leak nothing (predictions
// are competitive information until the whistle). Names + avatars are the
// same data the tenant leaderboard already shows to every member.
// ---------------------------------------------------------------------------

interface ExactPredictor {
  user_id: string;
  display_name: string | null;
  avatar_emoji: string | null;
}

// 60s in-memory cache keyed matchId:tenantId — post-FT the list is static
// (barring an admin re-score, where 60s staleness is fine). Single API
// instance, same pattern as the stats/tenant caches. Bounded: 104 matches
// × a few dozen tenants.
const revealCache = new Map<string, { body: unknown; expires: number }>();
const REVEAL_TTL_MS = 60_000;
const REVEAL_LIST_CAP = 100;

router.get("/:matchId/exact-predictions", requireAuth, async (c) => {
  const matchId = c.req.param("matchId");
  const tenantId = c.req.query("tenant_id");
  if (!tenantId) return c.json({ error: "tenant_id is required" }, 400);

  const cacheKey = `${matchId}:${tenantId}`;
  const cached = revealCache.get(cacheKey);
  if (cached && cached.expires > Date.now()) {
    return c.json(cached.body as Record<string, unknown>);
  }

  const matches = await sql<
    {
      home_score: number | null; away_score: number | null; status: string;
      penalty_home_score: number | null; penalty_away_score: number | null;
      duration: string | null;
    }[]
  >`
    SELECT home_score, away_score, status,
           penalty_home_score, penalty_away_score, duration
      FROM public.live_matches
     WHERE match_id = ${matchId}
     LIMIT 1
  `;
  const match = matches[0];
  if (!match) return c.json({ error: "Match not found" }, 404);

  if (match.status !== "FINISHED" || match.home_score === null || match.away_score === null) {
    // Don't cache the unrevealed state — the moment the match finishes,
    // the next request should see the list without waiting out a TTL.
    return c.json({ revealed: false });
  }

  // Earliest predictions first — being early AND right deserves the top
  // spot. created_at survives later edits (updated_at tracks those), so
  // this rewards the original call.
  const users = await sql<ExactPredictor[]>`
    SELECT pr.user_id, p.display_name, p.avatar_emoji
      FROM public.predictions pr
      LEFT JOIN public.profiles p ON p.user_id = pr.user_id
     WHERE pr.match_id = ${matchId}
       AND pr.tenant_id = ${tenantId}
       AND pr.home_score = ${match.home_score}
       AND pr.away_score = ${match.away_score}
     ORDER BY pr.created_at ASC
     LIMIT ${REVEAL_LIST_CAP}
  `;

  const countRows = await sql<{ exact_count: number; total_count: number }[]>`
    SELECT COUNT(*) FILTER (
             WHERE home_score = ${match.home_score}
               AND away_score = ${match.away_score}
           )::int AS exact_count,
           COUNT(*)::int AS total_count
      FROM public.predictions
     WHERE match_id = ${matchId}
       AND tenant_id = ${tenantId}
  `;
  const counts = countRows[0] ?? { exact_count: 0, total_count: 0 };

  // Knockout shootout: two extra "who called it" groups beyond the
  // open-play exact-score list. Both are scoped to users who actually
  // predicted a shootout (i.e. predicted a level score, so penalty
  // scores are set). The actual shootout winner is derived from the
  // live result's pen scores.
  const wentToPens =
    match.duration === "PENALTY_SHOOTOUT" &&
    match.penalty_home_score !== null &&
    match.penalty_away_score !== null;

  let penWinner: { count: number; users: ExactPredictor[] } | null = null;
  let penScore: { count: number; users: ExactPredictor[] } | null = null;

  if (wentToPens) {
    const ph = match.penalty_home_score as number;
    const pa = match.penalty_away_score as number;
    const winnerIsHome = ph > pa;

    // Penalty WINNER: predicted a level score + a decisive shootout whose
    // winning side matches the actual shootout winner.
    const penWinnerUsers = await sql<ExactPredictor[]>`
      SELECT pr.user_id, p.display_name, p.avatar_emoji
        FROM public.predictions pr
        LEFT JOIN public.profiles p ON p.user_id = pr.user_id
       WHERE pr.match_id = ${matchId}
         AND pr.tenant_id = ${tenantId}
         AND pr.home_score = pr.away_score
         AND pr.penalty_home_score IS NOT NULL AND pr.penalty_away_score IS NOT NULL
         AND pr.penalty_home_score <> pr.penalty_away_score
         AND (pr.penalty_home_score > pr.penalty_away_score) = ${winnerIsHome}
       ORDER BY pr.created_at ASC
       LIMIT ${REVEAL_LIST_CAP}
    `;
    // Penalty SCORE: predicted the exact shootout scoreline.
    const penScoreUsers = await sql<ExactPredictor[]>`
      SELECT pr.user_id, p.display_name, p.avatar_emoji
        FROM public.predictions pr
        LEFT JOIN public.profiles p ON p.user_id = pr.user_id
       WHERE pr.match_id = ${matchId}
         AND pr.tenant_id = ${tenantId}
         AND pr.penalty_home_score = ${ph}
         AND pr.penalty_away_score = ${pa}
       ORDER BY pr.created_at ASC
       LIMIT ${REVEAL_LIST_CAP}
    `;
    const penCountRows = await sql<{ winner_count: number; score_count: number }[]>`
      SELECT COUNT(*) FILTER (
               WHERE home_score = away_score
                 AND penalty_home_score IS NOT NULL AND penalty_away_score IS NOT NULL
                 AND penalty_home_score <> penalty_away_score
                 AND (penalty_home_score > penalty_away_score) = ${winnerIsHome}
             )::int AS winner_count,
             COUNT(*) FILTER (
               WHERE penalty_home_score = ${ph} AND penalty_away_score = ${pa}
             )::int AS score_count
        FROM public.predictions
       WHERE match_id = ${matchId} AND tenant_id = ${tenantId}
    `;
    const pc = penCountRows[0] ?? { winner_count: 0, score_count: 0 };
    penWinner = { count: pc.winner_count, users: penWinnerUsers };
    penScore = { count: pc.score_count, users: penScoreUsers };
  }

  const body = {
    revealed: true,
    exact_count: counts.exact_count,
    total_count: counts.total_count,
    users,
    went_to_pens: wentToPens,
    pen_winner: penWinner,
    pen_score: penScore,
  };
  revealCache.set(cacheKey, { body, expires: Date.now() + REVEAL_TTL_MS });
  return c.json(body);
});

export default router;
