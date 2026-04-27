import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { sql } from "../db";
import { type AuthEnv } from "../auth/middleware";
import { subscribeMatchEvents } from "../lib/matchEvents";

const router = new Hono<AuthEnv>();

// GET /api/matches?stage=group|knockout
// Stage filter uses the normalised values sync-matches writes: 'group' for
// group-stage fixtures, anything else ('round16', 'quarter', 'semi', etc.)
// is considered knockout.
router.get("/", async (c) => {
  const stage = c.req.query("stage");
  let rows;
  if (stage === "group") {
    rows = await sql`SELECT * FROM live_matches WHERE stage = 'group' ORDER BY match_date ASC`;
  } else if (stage === "knockout") {
    rows = await sql`SELECT * FROM live_matches WHERE stage <> 'group' ORDER BY match_date ASC`;
  } else {
    rows = await sql`SELECT * FROM live_matches ORDER BY match_date ASC`;
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

export default router;
