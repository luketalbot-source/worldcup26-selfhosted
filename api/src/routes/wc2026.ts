import { Hono } from "hono";
import { sql } from "../db";
import { type AuthEnv } from "../auth/middleware";
import { maybeTriggerBackgroundSync } from "./admin";

// WC2026 static-data-ish endpoints — teams roster, driven by the public.teams
// table that POST /api/admin/sync-matches populates from football-data.org.
// Public (no auth) because the roster isn't sensitive and the tenant app may
// need it pre-login.

const router = new Hono<AuthEnv>();

interface TeamRow {
  id: string;
  tla: string;
  name: string;
  short_name: string | null;
  crest_url: string | null;
  group_name: string | null;
  fd_team_id: number | null;
  updated_at: string;
}

// GET /api/wc2026/teams
// Returns all 48 teams as a flat array, plus a group breakdown for UI
// convenience. Teams without a group_name (rare — pre-sync) are placed in
// `ungrouped`.
//
// Side effect: if the table is empty OR the most recent row is more than
// STALE_AFTER_MS old, fire a background sync so the next page load gets
// fresh data. Non-blocking — we return whatever we currently have.
router.get("/teams", async (c) => {
  const rows = (await sql`
    SELECT id, tla, name, short_name, crest_url, group_name, fd_team_id, updated_at
    FROM public.teams
    ORDER BY group_name NULLS LAST, name
  `) as unknown as TeamRow[];

  // Kick off a background refresh if data is missing or stale. Best-effort.
  void maybeTriggerBackgroundSync(rows);

  const groups: Record<string, TeamRow[]> = {};
  const ungrouped: TeamRow[] = [];

  for (const row of rows) {
    if (row.group_name) {
      if (!groups[row.group_name]) groups[row.group_name] = [];
      groups[row.group_name]!.push(row);
    } else {
      ungrouped.push(row);
    }
  }

  // Cache for 5 minutes. The roster only changes when the admin runs
  // sync-matches; first paint should hit cache after the first page load
  // of a session. stale-while-revalidate lets the next call use the cached
  // copy immediately while the browser refreshes in the background.
  c.header("Cache-Control", "public, max-age=300, stale-while-revalidate=900");
  return c.json({
    teams: rows,
    groups,
    ungrouped,
    count: rows.length,
  });
});

export default router;
