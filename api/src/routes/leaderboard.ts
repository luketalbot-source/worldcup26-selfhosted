import { Hono } from "hono";
import { sql } from "../db";
import type { AuthEnv } from "../auth/middleware";

const router = new Hono<AuthEnv>();

router.get("/", async (c) => {
  const tenantId = c.req.query("tenant_id");
  const leagueId = c.req.query("league_id");

  if (!tenantId) return c.json({ error: "tenant_id is required" }, 400);

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
        SELECT pr.user_id, pr.match_id, pr.predicted_home_score, pr.predicted_away_score
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
               COUNT(*) AS pred_count
        FROM all_preds ap
        INNER JOIN live_matches lm2 ON lm2.id = ap.match_id
        GROUP BY ap.user_id
      ),
      all_boost_preds AS (
        SELECT bp.user_id, bp.award_id, bp.predicted_value
        FROM boost_predictions bp
        INNER JOIN league_users lu ON lu.user_id = bp.user_id
        WHERE bp.tenant_id = ${tenantId}
      ),
      boost_pts AS (
        SELECT abp.user_id,
               SUM(CASE WHEN br.result_value = abp.predicted_value THEN ba.points_value ELSE 0 END) AS pts
        FROM all_boost_preds abp
        INNER JOIN boost_awards ba ON ba.id = abp.award_id
        LEFT JOIN boost_results br ON br.award_id = abp.award_id
        GROUP BY abp.user_id
      ),
      all_custom_preds AS (
        SELECT cbp.user_id, cbp.custom_boost_id, cbp.predicted_value
        FROM tenant_custom_boost_predictions cbp
        INNER JOIN league_users lu ON lu.user_id = cbp.user_id
        INNER JOIN tenant_custom_boosts cb ON cb.id = cbp.custom_boost_id
        WHERE cb.tenant_id = ${tenantId}
      ),
      custom_pts AS (
        SELECT acp.user_id,
               SUM(CASE WHEN cbr.result_value = acp.predicted_value THEN cb2.points_value ELSE 0 END) AS pts
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
        RANK() OVER (ORDER BY COALESCE(mp.pts, 0) + COALESCE(bp.pts, 0) + COALESCE(cp.pts, 0) DESC) AS rank
      FROM league_users lu
      LEFT JOIN match_pts mp ON mp.user_id = lu.user_id
      LEFT JOIN boost_pts bp ON bp.user_id = lu.user_id
      LEFT JOIN custom_pts cp ON cp.user_id = lu.user_id
      ORDER BY points DESC, lu.display_name ASC
    `;
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
      SELECT pr.user_id, pr.match_id, pr.predicted_home_score, pr.predicted_away_score
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
             COUNT(*) AS pred_count
      FROM all_preds ap
      INNER JOIN live_matches lm ON lm.id = ap.match_id
      GROUP BY ap.user_id
    ),
    all_boost_preds AS (
      SELECT bp.user_id, bp.award_id, bp.predicted_value
      FROM boost_predictions bp
      INNER JOIN tenant_users tu ON tu.user_id = bp.user_id
      WHERE bp.tenant_id = ${tenantId}
    ),
    boost_pts AS (
      SELECT abp.user_id,
             SUM(CASE WHEN br.result_value = abp.predicted_value THEN ba.points_value ELSE 0 END) AS pts
      FROM all_boost_preds abp
      INNER JOIN boost_awards ba ON ba.id = abp.award_id
      LEFT JOIN boost_results br ON br.award_id = abp.award_id
      GROUP BY abp.user_id
    ),
    all_custom_preds AS (
      SELECT cbp.user_id, cbp.custom_boost_id, cbp.predicted_value
      FROM tenant_custom_boost_predictions cbp
      INNER JOIN tenant_users tu ON tu.user_id = cbp.user_id
      INNER JOIN tenant_custom_boosts cb ON cb.id = cbp.custom_boost_id
      WHERE cb.tenant_id = ${tenantId}
    ),
    custom_pts AS (
      SELECT acp.user_id,
             SUM(CASE WHEN cbr.result_value = acp.predicted_value THEN cb2.points_value ELSE 0 END) AS pts
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
      RANK() OVER (ORDER BY COALESCE(mp.pts, 0) + COALESCE(bp.pts, 0) + COALESCE(cp.pts, 0) DESC) AS rank
    FROM tenant_users tu
    LEFT JOIN match_pts mp ON mp.user_id = tu.user_id
    LEFT JOIN boost_pts bp ON bp.user_id = tu.user_id
    LEFT JOIN custom_pts cp ON cp.user_id = tu.user_id
    ORDER BY points DESC, tu.display_name ASC
  `;
  return c.json(rows);
});

export default router;
