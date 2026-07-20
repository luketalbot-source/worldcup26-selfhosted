import { Hono } from "hono";
import { sql } from "../db";
import { type AuthEnv } from "../auth/middleware";
import { maybeTriggerBackgroundSync } from "../lib/matchSync";
import { getAllCompetitions, getCompetitionBySlug } from "../lib/competitions";

// Competition registry + per-competition teams roster.
//
// GET /api/competitions?tenant_id=<uuid>  — competitions ENABLED for that
//   tenant (via tenant_competitions, the per-tenant feature flag). Without
//   tenant_id, returns every competition (admin listing).
// GET /api/competitions/:slug/teams      — the teams payload for one
//   competition; same shape the old /api/wc2026/teams served, which now
//   aliases to this with slug 'wc-2026'.
//
// Public (no auth), like the old teams endpoint: neither the registry nor
// rosters are sensitive, and the tenant app may need them pre-login.

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

router.get("/", async (c) => {
  const tenantId = c.req.query("tenant_id");
  const all = await getAllCompetitions();

  let visible = all;
  if (tenantId) {
    const enabled = await sql<{ competition_id: string }[]>`
      SELECT competition_id FROM public.tenant_competitions
       WHERE tenant_id = ${tenantId}
    `;
    const enabledIds = new Set(enabled.map((r) => r.competition_id));
    visible = all.filter((comp) => enabledIds.has(comp.id));
  }

  c.header("Cache-Control", "public, max-age=300, stale-while-revalidate=900");
  return c.json(visible);
});

/** Shared with the /api/wc2026/teams back-compat alias. */
export async function buildTeamsPayload(slug: string) {
  const comp = await getCompetitionBySlug(slug);
  if (!comp) return null;

  const rows = (await sql`
    SELECT id, tla, name, short_name, crest_url, group_name, fd_team_id, updated_at
    FROM public.teams
    WHERE competition_id = ${comp.id}
    ORDER BY group_name NULLS LAST, name
  `) as unknown as TeamRow[];

  // Self-heal: refresh missing/stale rosters in the background (no-ops for
  // archived competitions — their data is final).
  void maybeTriggerBackgroundSync(rows, comp.id);

  const groups: Record<string, TeamRow[]> = {};
  const ungrouped: TeamRow[] = [];
  for (const row of rows) {
    if (row.group_name) {
      (groups[row.group_name] ??= []).push(row);
    } else {
      ungrouped.push(row);
    }
  }

  return { competition: comp.slug, teams: rows, groups, ungrouped, count: rows.length };
}

router.get("/:slug/teams", async (c) => {
  const payload = await buildTeamsPayload(c.req.param("slug"));
  if (!payload) return c.json({ error: "Unknown competition" }, 404);
  c.header("Cache-Control", "public, max-age=300, stale-while-revalidate=900");
  return c.json(payload);
});

export default router;
