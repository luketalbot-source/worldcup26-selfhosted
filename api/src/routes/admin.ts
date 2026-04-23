import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { sql } from "../db";
import { requireAdmin, type AuthEnv } from "../auth/middleware";

const router = new Hono<AuthEnv>();

router.delete("/users/:userId", requireAdmin, async (c) => {
  const userId = c.req.param("userId");
  await sql`DELETE FROM public.users WHERE id = ${userId}`;
  return c.json({ ok: true });
});

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

function generateMatchId(match: FootballDataMatch): string {
  const homeCode = match.homeTeam.tla || "TBD";
  const awayCode = match.awayTeam.tla || "TBD";
  const stage = match.stage || "GROUP";
  const group = match.group || "";
  return `${stage}-${group}-${homeCode}-${awayCode}-${match.matchday}`.replace(/\s/g, "");
}

function mapStage(apiStage: string): string {
  const m: Record<string, string> = {
    GROUP_STAGE: "group",
    LAST_16: "round16",
    QUARTER_FINALS: "quarter",
    SEMI_FINALS: "semi",
    THIRD_PLACE: "third",
    FINAL: "final",
  };
  return m[apiStage] ?? "group";
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
        await sql`
          INSERT INTO public.live_matches (
            match_id, api_match_id, home_team_name, home_team_code,
            away_team_name, away_team_code, home_score, away_score,
            match_date, venue, stage, group_name, status, last_updated
          ) VALUES (
            ${generateMatchId(match)},
            ${match.id},
            ${match.homeTeam.name},
            ${match.homeTeam.tla || match.homeTeam.shortName?.substring(0, 3).toUpperCase() || "TBD"},
            ${match.awayTeam.name},
            ${match.awayTeam.tla || match.awayTeam.shortName?.substring(0, 3).toUpperCase() || "TBD"},
            ${match.score.fullTime.home},
            ${match.score.fullTime.away},
            ${match.utcDate},
            ${match.venue},
            ${mapStage(match.stage)},
            ${match.group},
            ${match.status},
            NOW()
          )
          ON CONFLICT (match_id) DO UPDATE SET
            api_match_id   = EXCLUDED.api_match_id,
            home_score     = EXCLUDED.home_score,
            away_score     = EXCLUDED.away_score,
            match_date     = EXCLUDED.match_date,
            venue          = EXCLUDED.venue,
            stage          = EXCLUDED.stage,
            group_name     = EXCLUDED.group_name,
            status         = EXCLUDED.status,
            last_updated   = NOW()
        `;
        syncState.matchesUpdated++;
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
              ${team.name},
              ${team.shortName ?? team.name},
              ${team.crest ?? null},
              ${group},
              ${team.id},
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

    syncState.status = "success";
    syncState.finishedAt = new Date().toISOString();
  } catch (err) {
    syncState.status = "failed";
    syncState.error = err instanceof Error ? err.message : String(err);
    syncState.finishedAt = new Date().toISOString();
    console.error("[sync-matches] failed:", err);
  }
}

router.post("/sync-matches", requireAdmin, async (c) => {
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

router.get("/sync-status", requireAdmin, async (c) => {
  return c.json(syncState);
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

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/imagen-3.0-generate-002:predict?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          instances: [{ prompt }],
          parameters: { sampleCount: 1, aspectRatio: "1:1" },
        }),
      }
    );

    if (!res.ok) {
      const errText = await res.text();
      console.error("Imagen API error:", errText);
      return c.json({ error: "Image generation failed" }, 502);
    }

    const data = (await res.json()) as any;
    const b64 = data.predictions?.[0]?.bytesBase64Encoded;
    if (!b64) return c.json({ error: "No image returned" }, 502);

    const imageUrl = `data:image/png;base64,${b64}`;

    await sql`
      UPDATE tenant_custom_boosts SET image_url = ${imageUrl}, updated_at = NOW()
      WHERE id = ${body.boostId}
    `;

    return c.json({ imageUrl });
  }
);

export default router;
