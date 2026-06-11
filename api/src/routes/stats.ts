// Tournament-wide stats endpoint powering the "Matchday Update" /
// Stats tab in the user-facing app. Aggregates straight off the
// live_matches + match_goals + match_bookings tables we maintain — no
// background materialised views, the data volume is tiny.
//
// Phase 1 (May 2026): totals, scorers, team-goals, clean sheets,
//                     biggest win, fastest goal.
// Phase 2 (Jun 2026): discipline panel — yellow/red counts derived from
//                     match_bookings, plus the team with the worst
//                     discipline score (red counted ×3).
//
// A future Phase 3 might add a `today` mode that pivots all of these
// to a single matchday — schema already supports it, only the SQL +
// frontend toggle would need to come along.

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

// Worst-discipline team — red weighted ×3 vs yellow ×1 + second_yellow
// ×2 (since a second yellow is "a yellow plus its consequence"). Picks
// the highest score; ties broken alphabetically by team code so the
// result is stable across reloads.
interface WorstDiscipline {
  team_code: string;
  team_name: string;
  yellow: number;
  second_yellow: number;
  red: number;
  total_cards: number;
  score: number;
}

// 30s in-memory response cache. The Stats tab refetches on every goal
// SSE event, so a goal with N connected clients used to mean N×8
// aggregate queries inside a second — during the June 11 login surge
// that (together with the unindexed tenant user_count scan) exhausted
// the DB pool and 503'd the endpoint. Single API instance, so a module
// var is correct (same documented constraint as the SSE pub/sub).
// 30s staleness on a stats roll-up is invisible to users.
let statsCache: { body: unknown; expires: number } | null = null;
const STATS_TTL_MS = 30_000;

// Public — same auth posture as /api/matches. Anyone with a tenant page
// open should see tournament-wide stats.
router.get("/tournament", async (c) => {
  if (statsCache && statsCache.expires > Date.now()) {
    return c.json(statsCache.body as Record<string, unknown>);
  }
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

  // 7) Discipline totals — counts off match_bookings. A "second_yellow"
  //    counts toward the YELLOW total (it IS a yellow) AND the RED
  //    total (it triggers a sending-off). That matches how Wikipedia /
  //    UEFA report tournament-wide card counts.
  const cardTotalsRows = await sql<
    { yellow: number; red: number }[]
  >`
    SELECT
      COUNT(*) FILTER (
        WHERE card_type IN ('yellow', 'second_yellow')
      )::int AS yellow,
      COUNT(*) FILTER (
        WHERE card_type IN ('red', 'second_yellow')
      )::int AS red
    FROM public.match_bookings
  `;
  const cardTotals = cardTotalsRows[0] ?? { yellow: 0, red: 0 };

  // 8) Worst-discipline team. Per-team-side aggregation joined to the
  //    match for the team code/name, then ranked by a weighted score:
  //      yellow=1, second_yellow=2, red=3
  //    Picks the single worst — frontend shows the headline; runners-up
  //    aren't surfaced.
  const worstRows = await sql<WorstDiscipline[]>`
    SELECT team_code, team_name,
           SUM(CASE WHEN card_type = 'yellow'        THEN 1 ELSE 0 END)::int AS yellow,
           SUM(CASE WHEN card_type = 'second_yellow' THEN 1 ELSE 0 END)::int AS second_yellow,
           SUM(CASE WHEN card_type = 'red'           THEN 1 ELSE 0 END)::int AS red,
           COUNT(*)::int AS total_cards,
           SUM(
             CASE card_type
               WHEN 'yellow'        THEN 1
               WHEN 'second_yellow' THEN 2
               WHEN 'red'           THEN 3
               ELSE 0
             END
           )::int AS score
      FROM (
        SELECT mb.card_type,
               CASE WHEN mb.team_side = 'home' THEN lm.home_team_code
                    ELSE lm.away_team_code
               END AS team_code,
               CASE WHEN mb.team_side = 'home' THEN lm.home_team_name
                    ELSE lm.away_team_name
               END AS team_name
          FROM public.match_bookings mb
          JOIN public.live_matches lm ON lm.match_id = mb.match_id
      ) per_team
     GROUP BY team_code, team_name
     ORDER BY score DESC, team_code ASC
     LIMIT 1
  `;
  const worstDiscipline = worstRows[0] ?? null;

  // Average per match — JS-side so we don't have to do an avg with a
  // NULLIF dance in SQL. Returns 0 cleanly when nothing's been played.
  const perMatch =
    totals.matches_played > 0
      ? Number((totals.total_goals / totals.matches_played).toFixed(2))
      : 0;
  const cardsPerMatch =
    totals.matches_played > 0
      ? Number(
          ((cardTotals.yellow + cardTotals.red) / totals.matches_played).toFixed(2),
        )
      : 0;

  const body = {
    totals: {
      goals: totals.total_goals,
      matches_played: totals.matches_played,
      matches_scheduled: totals.matches_scheduled,
      per_match: perMatch,
      yellow_cards: cardTotals.yellow,
      red_cards: cardTotals.red,
      cards_per_match: cardsPerMatch,
    },
    top_scorers: topScorers,
    team_goals: teamGoals,
    clean_sheets: cleanSheets,
    biggest_win: biggestWin,
    fastest_goal: fastestGoal,
    worst_discipline: worstDiscipline,
  };
  statsCache = { body, expires: Date.now() + STATS_TTL_MS };
  return c.json(body);
});

export default router;
