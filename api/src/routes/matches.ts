import { Hono } from "hono";
import { sql } from "../db";
import { type AuthEnv } from "../auth/middleware";

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
  return c.json(rows);
});

export default router;
