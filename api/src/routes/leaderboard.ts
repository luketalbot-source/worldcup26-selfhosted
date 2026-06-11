import { Hono } from "hono";
import { LRUCache } from "lru-cache";
import { sql } from "../db";
import type { AuthEnv } from "../auth/middleware";

const router = new Hono<AuthEnv>();

// 15s in-memory response cache: the standings query below is expensive,
// so concurrent viewers share one computation per TTL window instead of
// triggering a full recomputation each. Single API instance, so
// module-level is correct (same documented constraint as the SSE pub/sub
// and the stats/tenant caches). 15s staleness on standings is invisible —
// scores only move on goals. max bounds memory across tenants and leagues.
const leaderboardCache = new LRUCache<string, unknown[]>({
  max: 5000,
  ttl: 15_000,
});

// Drop all cached standings. Called from the admin score-edit PATCH so a
// manual result correction is visible immediately rather than after TTL
// expiry; the FD sync path deliberately relies on the 15s TTL instead.
export function invalidateLeaderboardCache() {
  leaderboardCache.clear();
}

router.get("/", async (c) => {
  const tenantId = c.req.query("tenant_id");
  const leagueId = c.req.query("league_id");

  if (!tenantId) return c.json({ error: "tenant_id is required" }, 400);

  // tenant_id + league_id are the only inputs the queries below read, so
  // together they fully determine the response.
  const cacheKey = `${tenantId}:${leagueId ?? ""}`;
  const cached = leaderboardCache.get(cacheKey);
  if (cached) return c.json(cached as Record<string, unknown>[]);

  if (leagueId) {
    const rows = await sql`
      WITH league_users AS (
        SELECT u.id AS user_id, p.display_name, p.avatar_emoji,
               (l.creator_id = u.id) AS is_creator
        FROM league_members lm
        INNER JOIN public.users u ON u.id = lm.user_id
        LEFT JOIN profiles p ON p.user_id = u.id
        INNER JOIN leagues l ON l.id = lm.league_id
        WHERE lm.league_id = ${leagueId}
      ),
      all_preds AS (
        SELECT pr.user_id, pr.match_id, pr.home_score AS predicted_home_score, pr.away_score AS predicted_away_score
        FROM predictions pr
        INNER JOIN league_users lu ON lu.user_id = pr.user_id
        WHERE pr.tenant_id = ${tenantId}
      ),
      match_pts AS (
        SELECT ap.user_id,
               SUM(
                 CASE
                   WHEN lm2.home_score IS NULL OR lm2.away_score IS NULL THEN 0
                   WHEN ap.predicted_home_score = lm2.home_score AND ap.predicted_away_score = lm2.away_score THEN 3
                   WHEN SIGN(ap.predicted_home_score - ap.predicted_away_score) = SIGN(lm2.home_score - lm2.away_score) THEN 1
                   ELSE 0
                 END
               ) AS pts,
               COUNT(*) AS pred_count,
               -- Tiebreak: exact-score picks (3pt outcomes).
               SUM(
                 CASE
                   WHEN lm2.home_score IS NULL OR lm2.away_score IS NULL THEN 0
                   WHEN ap.predicted_home_score = lm2.home_score AND ap.predicted_away_score = lm2.away_score THEN 1
                   ELSE 0
                 END
               ) AS exact_count,
               -- Tiebreak: correct-result-but-not-exact picks (1pt outcomes).
               -- Mutually exclusive with exact_count above so a single
               -- correct exact pick isn't counted twice during ranking.
               SUM(
                 CASE
                   WHEN lm2.home_score IS NULL OR lm2.away_score IS NULL THEN 0
                   WHEN ap.predicted_home_score = lm2.home_score AND ap.predicted_away_score = lm2.away_score THEN 0
                   WHEN SIGN(ap.predicted_home_score - ap.predicted_away_score) = SIGN(lm2.home_score - lm2.away_score) THEN 1
                   ELSE 0
                 END
               ) AS correct_count,
               -- Tiebreak: total absolute goal-diff vs actuals, summed
               -- across every SCORED prediction. Lower = closer to
               -- reality. Unplayed matches contribute 0 so an
               -- early-stage user isn't penalised for kick-offs that
               -- haven't happened yet.
               SUM(
                 CASE
                   WHEN lm2.home_score IS NULL OR lm2.away_score IS NULL THEN 0
                   ELSE ABS(ap.predicted_home_score - lm2.home_score)
                      + ABS(ap.predicted_away_score - lm2.away_score)
                 END
               ) AS goal_diff_sum
        FROM all_preds ap
        INNER JOIN live_matches lm2 ON lm2.match_id = ap.match_id
        GROUP BY ap.user_id
      ),
      all_boost_preds AS (
        SELECT bp.user_id, bp.award_id, bp.predicted_team_code, bp.predicted_player_name
        FROM boost_predictions bp
        INNER JOIN league_users lu ON lu.user_id = bp.user_id
        WHERE bp.tenant_id = ${tenantId}
      ),
      boost_pts AS (
        SELECT abp.user_id,
               SUM(
                 CASE
                   WHEN br.result_team_code   IS NOT NULL AND abp.predicted_team_code   = br.result_team_code   THEN ba.points_value
                   WHEN br.result_player_name IS NOT NULL AND abp.predicted_player_name = br.result_player_name THEN ba.points_value
                   ELSE 0
                 END
               ) AS pts,
               COUNT(*) AS pred_count
        FROM all_boost_preds abp
        INNER JOIN boost_awards ba ON ba.id = abp.award_id
        LEFT JOIN boost_results br ON br.award_id = abp.award_id
        GROUP BY abp.user_id
      ),
      all_custom_preds AS (
        SELECT cbp.user_id, cbp.custom_boost_id, cbp.predicted_team_code, cbp.predicted_player_name
        FROM tenant_custom_boost_predictions cbp
        INNER JOIN league_users lu ON lu.user_id = cbp.user_id
        INNER JOIN tenant_custom_boosts cb ON cb.id = cbp.custom_boost_id
        WHERE cb.tenant_id = ${tenantId}
      ),
      custom_pts AS (
        SELECT acp.user_id,
               SUM(
                 CASE
                   WHEN cbr.result_team_code   IS NOT NULL AND acp.predicted_team_code   = cbr.result_team_code   THEN cb2.points_value
                   WHEN cbr.result_player_name IS NOT NULL AND acp.predicted_player_name = cbr.result_player_name THEN cb2.points_value
                   ELSE 0
                 END
               ) AS pts,
               COUNT(*) AS pred_count
        FROM all_custom_preds acp
        INNER JOIN tenant_custom_boosts cb2 ON cb2.id = acp.custom_boost_id
        LEFT JOIN tenant_custom_boost_results cbr ON cbr.custom_boost_id = acp.custom_boost_id
        GROUP BY acp.user_id
      )
      SELECT
        lu.user_id,
        lu.display_name,
        lu.avatar_emoji,
        lu.is_creator,
        COALESCE(mp.pts, 0) + COALESCE(bp.pts, 0) + COALESCE(cp.pts, 0) AS points,
        COALESCE(mp.pred_count, 0) AS total_predictions,
        -- Tie-break detail columns surfaced in the response so the UI
        -- could one day render a "why are you ranked here" tooltip.
        -- Additive vs the previous shape — existing callers ignore them.
        COALESCE(mp.exact_count, 0)   AS exact_count,
        COALESCE(mp.correct_count, 0) AS correct_count,
        COALESCE(mp.goal_diff_sum, 0) AS goal_diff_sum,
        COALESCE(mp.pred_count, 0)
          + COALESCE(bp.pred_count, 0)
          + COALESCE(cp.pred_count, 0) AS total_picks,
        -- Multi-stage tiebreak:
        --   1. total points              (DESC)
        --   2. exact-score predictions   (DESC)
        --   3. correct-result predictions (DESC, 1pt outcomes only)
        --   4. goal-difference sum       (ASC — closer to reality wins)
        --   5. total picks across matches + boosts + custom (DESC)
        --
        -- Users with no scored matches get goal_diff_sum=0, which
        -- could otherwise tie them with a perfect predictor. The
        -- exact/correct counts ahead of it handle that — both are
        -- also 0 for a no-predictions user, so they fall through.
        RANK() OVER (
          ORDER BY COALESCE(mp.pts, 0) + COALESCE(bp.pts, 0) + COALESCE(cp.pts, 0) DESC,
                   COALESCE(mp.exact_count, 0)   DESC,
                   COALESCE(mp.correct_count, 0) DESC,
                   COALESCE(mp.goal_diff_sum, 0) ASC,
                   COALESCE(mp.pred_count, 0)
                     + COALESCE(bp.pred_count, 0)
                     + COALESCE(cp.pred_count, 0) DESC
        ) AS rank
      FROM league_users lu
      LEFT JOIN match_pts mp ON mp.user_id = lu.user_id
      LEFT JOIN boost_pts bp ON bp.user_id = lu.user_id
      LEFT JOIN custom_pts cp ON cp.user_id = lu.user_id
      ORDER BY points DESC,
               exact_count DESC,
               correct_count DESC,
               goal_diff_sum ASC,
               total_picks DESC,
               lu.display_name ASC
    `;
    leaderboardCache.set(cacheKey, [...rows]);
    return c.json(rows);
  }

  // Tenant leaderboard
  const rows = await sql`
    WITH tenant_users AS (
      SELECT u.id AS user_id, p.display_name, p.avatar_emoji
      FROM oidc_identities oi
      INNER JOIN public.users u ON u.id = oi.user_id
      LEFT JOIN profiles p ON p.user_id = u.id
      WHERE oi.tenant_id = ${tenantId}
    ),
    all_preds AS (
      SELECT pr.user_id, pr.match_id, pr.home_score AS predicted_home_score, pr.away_score AS predicted_away_score
      FROM predictions pr
      INNER JOIN tenant_users tu ON tu.user_id = pr.user_id
      WHERE pr.tenant_id = ${tenantId}
    ),
    match_pts AS (
      SELECT ap.user_id,
             SUM(
               CASE
                 WHEN lm.home_score IS NULL OR lm.away_score IS NULL THEN 0
                 WHEN ap.predicted_home_score = lm.home_score AND ap.predicted_away_score = lm.away_score THEN 3
                 WHEN SIGN(ap.predicted_home_score - ap.predicted_away_score) = SIGN(lm.home_score - lm.away_score) THEN 1
                 ELSE 0
               END
             ) AS pts,
             COUNT(*) AS pred_count,
             -- Tiebreak: exact-score picks (3pt outcomes). See the
             -- league query above for the full rationale.
             SUM(
               CASE
                 WHEN lm.home_score IS NULL OR lm.away_score IS NULL THEN 0
                 WHEN ap.predicted_home_score = lm.home_score AND ap.predicted_away_score = lm.away_score THEN 1
                 ELSE 0
               END
             ) AS exact_count,
             -- Tiebreak: correct-result-but-not-exact picks (1pt
             -- outcomes), mutually exclusive with exact_count.
             SUM(
               CASE
                 WHEN lm.home_score IS NULL OR lm.away_score IS NULL THEN 0
                 WHEN ap.predicted_home_score = lm.home_score AND ap.predicted_away_score = lm.away_score THEN 0
                 WHEN SIGN(ap.predicted_home_score - ap.predicted_away_score) = SIGN(lm.home_score - lm.away_score) THEN 1
                 ELSE 0
               END
             ) AS correct_count,
             -- Tiebreak: total absolute goal-diff vs actuals.
             -- Lower = closer to reality. Unplayed matches contribute 0.
             SUM(
               CASE
                 WHEN lm.home_score IS NULL OR lm.away_score IS NULL THEN 0
                 ELSE ABS(ap.predicted_home_score - lm.home_score)
                    + ABS(ap.predicted_away_score - lm.away_score)
               END
             ) AS goal_diff_sum
      FROM all_preds ap
      INNER JOIN live_matches lm ON lm.match_id = ap.match_id
      GROUP BY ap.user_id
    ),
    all_boost_preds AS (
      SELECT bp.user_id, bp.award_id, bp.predicted_team_code, bp.predicted_player_name
      FROM boost_predictions bp
      INNER JOIN tenant_users tu ON tu.user_id = bp.user_id
      WHERE bp.tenant_id = ${tenantId}
    ),
    boost_pts AS (
      SELECT abp.user_id,
             SUM(
               CASE
                 WHEN br.result_team_code   IS NOT NULL AND abp.predicted_team_code   = br.result_team_code   THEN ba.points_value
                 WHEN br.result_player_name IS NOT NULL AND abp.predicted_player_name = br.result_player_name THEN ba.points_value
                 ELSE 0
               END
             ) AS pts,
             COUNT(*) AS pred_count
      FROM all_boost_preds abp
      INNER JOIN boost_awards ba ON ba.id = abp.award_id
      LEFT JOIN boost_results br ON br.award_id = abp.award_id
      GROUP BY abp.user_id
    ),
    all_custom_preds AS (
      SELECT cbp.user_id, cbp.custom_boost_id, cbp.predicted_team_code, cbp.predicted_player_name
      FROM tenant_custom_boost_predictions cbp
      INNER JOIN tenant_users tu ON tu.user_id = cbp.user_id
      INNER JOIN tenant_custom_boosts cb ON cb.id = cbp.custom_boost_id
      WHERE cb.tenant_id = ${tenantId}
    ),
    custom_pts AS (
      SELECT acp.user_id,
             SUM(
               CASE
                 WHEN cbr.result_team_code   IS NOT NULL AND acp.predicted_team_code   = cbr.result_team_code   THEN cb2.points_value
                 WHEN cbr.result_player_name IS NOT NULL AND acp.predicted_player_name = cbr.result_player_name THEN cb2.points_value
                 ELSE 0
               END
             ) AS pts,
             COUNT(*) AS pred_count
      FROM all_custom_preds acp
      INNER JOIN tenant_custom_boosts cb2 ON cb2.id = acp.custom_boost_id
      LEFT JOIN tenant_custom_boost_results cbr ON cbr.custom_boost_id = acp.custom_boost_id
      GROUP BY acp.user_id
    )
    SELECT
      tu.user_id,
      tu.display_name,
      tu.avatar_emoji,
      COALESCE(mp.pts, 0) + COALESCE(bp.pts, 0) + COALESCE(cp.pts, 0) AS points,
      COALESCE(mp.pred_count, 0) AS total_predictions,
      -- Detail columns surfaced in the response for future UI use.
      -- Additive vs the previous shape — existing callers ignore them.
      COALESCE(mp.exact_count, 0)   AS exact_count,
      COALESCE(mp.correct_count, 0) AS correct_count,
      COALESCE(mp.goal_diff_sum, 0) AS goal_diff_sum,
      COALESCE(mp.pred_count, 0)
        + COALESCE(bp.pred_count, 0)
        + COALESCE(cp.pred_count, 0) AS total_picks,
      -- 5-stage tiebreak — see league query above for the rationale
      -- and edge-case discussion.
      RANK() OVER (
        ORDER BY COALESCE(mp.pts, 0) + COALESCE(bp.pts, 0) + COALESCE(cp.pts, 0) DESC,
                 COALESCE(mp.exact_count, 0)   DESC,
                 COALESCE(mp.correct_count, 0) DESC,
                 COALESCE(mp.goal_diff_sum, 0) ASC,
                 COALESCE(mp.pred_count, 0)
                   + COALESCE(bp.pred_count, 0)
                   + COALESCE(cp.pred_count, 0) DESC
      ) AS rank
    FROM tenant_users tu
    LEFT JOIN match_pts mp ON mp.user_id = tu.user_id
    LEFT JOIN boost_pts bp ON bp.user_id = tu.user_id
    LEFT JOIN custom_pts cp ON cp.user_id = tu.user_id
    ORDER BY points DESC,
             exact_count DESC,
             correct_count DESC,
             goal_diff_sum ASC,
             total_picks DESC,
             tu.display_name ASC
  `;
  leaderboardCache.set(cacheKey, [...rows]);
  return c.json(rows);
});

export default router;
