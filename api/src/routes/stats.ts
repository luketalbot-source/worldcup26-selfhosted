// Tournament-wide stats endpoint powering the "Matchday Update" /
// Stats tab in the user-facing app. Pulled aggregates straight off the
// live_matches + match_goals tables we already maintain — no new
// schema for Phase 1.
//
// Phase 2 will add a `today` mode + discipline (yellow/red cards from a
// new `match_bookings` table fed by FD's bookings array). For now the
// endpoint always returns tournament-wide totals and leaves cards = 0;
// the frontend renders a dimmed-zero block when both card counts are
// zero so the placeholder is identical whether Phase 2 has shipped or
// not.

import { Hono } from "hono";
import { sql } from "../db";
import type { AuthEnv } from "../auth/middleware";

const router = new Hono<AuthEnv>();

interface TopScorer {
  player_name: string;
  team_code: string;
  team_name: string;
  goals: number;
}

interface TeamGoals {
  team_code: string;
  team_name: string;
  goals: number;
}

interface CleanSheet {
  team_code: string;
  team_name: string;
  count: number;
}

interface BiggestWin {
  match_id: string;
  home_team_code: string;
  home_team_name: string;
  away_team_code: string;
  away_team_name: string;
  home_score: number;
  away_score: number;
  margin: number;
  stage: string;
  group_name: string | null;
}

interface FastestGoal {
  player_name: string;
  team_code: string;
  team_name: string;
  minute: number;
  match_id: string;
  opponent_code: string;
  opponent_name: string;
}

// Public — same auth posture as /api/matches. Anyone with a tenant page
// open should see tournament-wide stats.
router.get("/tournament", async (c) => {
  // 1) Totals — counted only from matches with a finalised score so a
  //    not-yet-played row with NULL scores doesn't pollute averages.
  //    Status is set to FINISHED/AET/PEN by FD's sync; we accept any
  //    row where both scores are non-null as "counted".
  const totalsRows = await sql<
    { total_goals: number; matches_played: number; matches_scheduled: number }[]
  >`
    SELECT
      COALESCE(SUM(home_score + away_score), 0)::int AS total_goals,
      COUNT(*) FILTER (
        WHERE home_score IS NOT NULL AND away_score IS NOT NULL
      )::int AS matches_played,
      COUNT(*)::int AS matches_scheduled
    FROM public.live_matches
  `;
  const totals = totalsRows[0]!;

  // 2) Top scorers — straight aggregation off match_goals. team_side
  //    joined back to live_matches resolves the team behind each goal.
  //    Cap at 10 here, frontend renders top 3 + a "more" link.
  const topScorers = await sql<TopScorer[]>`
    SELECT mg.player_name,
           CASE WHEN mg.team_side = 'home' THEN lm.home_team_code
                ELSE lm.away_team_code
           END AS team_code,
           CASE WHEN mg.team_side = 'home' THEN lm.home_team_name
                ELSE lm.away_team_name
           END AS team_name,
           COUNT(*)::int AS goals
      FROM public.match_goals mg
      JOIN public.live_matches lm ON lm.match_id = mg.match_id
     WHERE mg.player_name IS NOT NULL AND mg.player_name <> ''
     GROUP BY mg.player_name, team_code, team_name
     ORDER BY goals DESC, mg.player_name ASC
     LIMIT 10
  `;

  // 3) Goals per team. Same shape as top scorers but grouped by team.
  const teamGoals = await sql<TeamGoals[]>`
    SELECT team_code, team_name, COUNT(*)::int AS goals
      FROM (
        SELECT CASE WHEN mg.team_side = 'home' THEN lm.home_team_code
                    ELSE lm.away_team_code
               END AS team_code,
               CASE WHEN mg.team_side = 'home' THEN lm.home_team_name
                    ELSE lm.away_team_name
               END AS team_name
          FROM public.match_goals mg
          JOIN public.live_matches lm ON lm.match_id = mg.match_id
      ) g
     GROUP BY team_code, team_name
     ORDER BY goals DESC, team_code ASC
     LIMIT 5
  `;

  // 4) Cleanest defence — count matches where this team's side conceded
  //    zero. Counted per side then summed via UNION ALL.
  const cleanSheets = await sql<CleanSheet[]>`
    SELECT team_code, team_name, COUNT(*)::int AS count
      FROM (
        SELECT home_team_code AS team_code, home_team_name AS team_name
          FROM public.live_matches
         WHERE home_score IS NOT NULL AND away_score = 0
        UNION ALL
        SELECT away_team_code, away_team_name
          FROM public.live_matches
         WHERE away_score IS NOT NULL AND home_score = 0
      ) s
     GROUP BY team_code, team_name
     ORDER BY count DESC, team_code ASC
     LIMIT 5
  `;

  // 5) Biggest win — single row by absolute score margin. NULLs guarded
  //    in WHERE so unplayed matches don't surface as "0-0".
  const biggestWinRows = await sql<BiggestWin[]>`
    SELECT match_id,
           home_team_code, home_team_name,
           away_team_code, away_team_name,
           home_score, away_score,
           ABS(home_score - away_score)::int AS margin,
           stage, group_name
      FROM public.live_matches
     WHERE home_score IS NOT NULL AND away_score IS NOT NULL
     ORDER BY ABS(home_score - away_score) DESC,
              (home_score + away_score) DESC,
              match_date DESC
     LIMIT 1
  `;
  const biggestWin = biggestWinRows[0] ?? null;

  // 6) Fastest goal. minute is non-null on every match_goals row by
  //    schema (NOT NULL). Ties broken by oldest match (i.e. first
  //    early-goal record holds).
  const fastestRows = await sql<FastestGoal[]>`
    SELECT mg.player_name,
           CASE WHEN mg.team_side = 'home' THEN lm.home_team_code
                ELSE lm.away_team_code
           END AS team_code,
           CASE WHEN mg.team_side = 'home' THEN lm.home_team_name
                ELSE lm.away_team_name
           END AS team_name,
           mg.minute,
           mg.match_id,
           CASE WHEN mg.team_side = 'home' THEN lm.away_team_code
                ELSE lm.home_team_code
           END AS opponent_code,
           CASE WHEN mg.team_side = 'home' THEN lm.away_team_name
                ELSE lm.home_team_name
           END AS opponent_name
      FROM public.match_goals mg
      JOIN public.live_matches lm ON lm.match_id = mg.match_id
     WHERE mg.player_name IS NOT NULL AND mg.player_name <> ''
     ORDER BY mg.minute ASC, lm.match_date ASC
     LIMIT 1
  `;
  const fastestGoal = fastestRows[0] ?? null;

  // Average per match — JS-side so we don't have to do an avg with a
  // NULLIF dance in SQL. Returns 0 cleanly when nothing's been played.
  const perMatch =
    totals.matches_played > 0
      ? Number((totals.total_goals / totals.matches_played).toFixed(2))
      : 0;

  return c.json({
    totals: {
      goals: totals.total_goals,
      matches_played: totals.matches_played,
      matches_scheduled: totals.matches_scheduled,
      per_match: perMatch,
      // Phase 2: real numbers from match_bookings. For now hard-zero so
      // the frontend always has a number to render and the "is the
      // tournament started?" branch is data-driven.
      yellow_cards: 0,
      red_cards: 0,
    },
    top_scorers: topScorers,
    team_goals: teamGoals,
    clean_sheets: cleanSheets,
    biggest_win: biggestWin,
    fastest_goal: fastestGoal,
  });
});

export default router;
