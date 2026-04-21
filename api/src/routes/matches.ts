import { Hono } from "hono";
import { sql } from "../db";
import { requireAdmin, type AuthEnv } from "../auth/middleware";

const router = new Hono<AuthEnv>();

router.get("/", async (c) => {
  const rows = await sql`SELECT * FROM live_matches ORDER BY match_date ASC`;
  return c.json(rows);
});

router.post("/admin/sync-matches", requireAdmin, async (c) => {
  const apiKey = process.env.FOOTBALL_DATA_API_KEY;
  if (!apiKey) return c.json({ error: "FOOTBALL_DATA_API_KEY not configured" }, 500);

  const res = await fetch("https://api.football-data.org/v4/competitions/WC/matches", {
    headers: { "X-Auth-Token": apiKey },
  });

  if (!res.ok) return c.json({ error: "Failed to fetch matches from football-data.org" }, 502);
  const data = await res.json() as { matches: any[] };

  const matches = data.matches ?? [];
  let upserted = 0;

  for (const m of matches) {
    const homeScore = m.score?.fullTime?.home ?? null;
    const awayScore = m.score?.fullTime?.away ?? null;
    const status = m.status ?? null;

    await sql`
      INSERT INTO live_matches (
        id, external_id, match_date,
        home_team, away_team,
        home_score, away_score,
        status, stage, updated_at
      )
      VALUES (
        gen_random_uuid(),
        ${String(m.id)},
        ${m.utcDate},
        ${m.homeTeam?.name ?? ""},
        ${m.awayTeam?.name ?? ""},
        ${homeScore},
        ${awayScore},
        ${status},
        ${m.stage ?? null},
        NOW()
      )
      ON CONFLICT (external_id) DO UPDATE
        SET home_score  = EXCLUDED.home_score,
            away_score  = EXCLUDED.away_score,
            status      = EXCLUDED.status,
            match_date  = EXCLUDED.match_date,
            stage       = EXCLUDED.stage,
            updated_at  = NOW()
    `;
    upserted++;
  }

  return c.json({ ok: true, upserted });
});

export default router;
