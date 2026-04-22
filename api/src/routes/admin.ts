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

router.post("/sync-matches", requireAdmin, async (c) => {
  const apiKey = process.env.FOOTBALL_DATA_API_KEY;
  if (!apiKey) return c.json({ error: "FOOTBALL_DATA_API_KEY not configured" }, 500);

  const res = await fetch(`${FOOTBALL_API_BASE}/competitions/${COMPETITION_CODE}/matches`, {
    headers: { "X-Auth-Token": apiKey },
  });

  if (res.status === 404) {
    return c.json({
      message: "World Cup 2026 data not yet available in the football-data.org API.",
      matchesUpdated: 0,
      status: "pending",
    });
  }

  if (!res.ok) {
    const errText = await res.text();
    return c.json({ error: `Football API returned ${res.status}: ${errText}` }, 502);
  }

  const data = (await res.json()) as { matches?: FootballDataMatch[] };
  const matches = data.matches ?? [];

  let updated = 0;
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
      updated++;
    } catch {
      // continue on per-row errors
    }
  }

  return c.json({ message: "Matches synced successfully", matchesUpdated: updated, totalMatches: matches.length });
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
