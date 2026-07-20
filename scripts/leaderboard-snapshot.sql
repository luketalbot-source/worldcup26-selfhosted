-- Leaderboard scoring digest — the no-regression proof for the
-- multi-competition migration (see plan: WC2026 → CL + Bundesliga).
--
-- Computes, for every tenant and every league, an md5 digest over each
-- user's scoring tuple (points, exact, correct, goal-diff, picks) using
-- the EXACT arithmetic of api/src/routes/leaderboard.ts (both paths).
-- Run before and after every migration phase / deploy; the output must
-- be byte-identical or scoring has regressed.
--
--   northflank exec service --project football-2026 --service postgres \
--     --shell-cmd 'sh -c' --cmd "psql -U \$POSTGRES_USER -d \$POSTGRES_DB \
--     -t -A -F' ' -f -" < scripts/leaderboard-snapshot.sql > snapshot.txt
--
-- Output rows:  T <tenant_id> <digest>   one per tenant (tenant leaderboard)
--               L <league_id> <digest>   one per league (league leaderboard)
--               ALL <row_count> <digest> global roll-up, first line
WITH match_pts AS (
  SELECT pr.tenant_id, pr.user_id,
    SUM(
      (CASE
        WHEN lm2.home_score IS NULL OR lm2.away_score IS NULL THEN 0
        WHEN pr.home_score = lm2.home_score AND pr.away_score = lm2.away_score THEN 3
        WHEN SIGN(pr.home_score - pr.away_score) = SIGN(lm2.home_score - lm2.away_score) THEN 1
        WHEN lm2.duration = 'PENALTY_SHOOTOUT'
         AND lm2.penalty_home_score IS NOT NULL AND lm2.penalty_away_score IS NOT NULL
         AND pr.home_score <> pr.away_score
         AND SIGN(pr.home_score - pr.away_score) = SIGN(lm2.penalty_home_score - lm2.penalty_away_score) THEN 1
        ELSE 0
      END)
      + (CASE
          WHEN lm2.duration = 'PENALTY_SHOOTOUT'
           AND lm2.penalty_home_score IS NOT NULL AND lm2.penalty_away_score IS NOT NULL
           AND pr.penalty_home_score IS NOT NULL AND pr.penalty_away_score IS NOT NULL
           AND pr.penalty_home_score <> pr.penalty_away_score
           AND pr.home_score = pr.away_score
          THEN (CASE WHEN SIGN(pr.penalty_home_score - pr.penalty_away_score) = SIGN(lm2.penalty_home_score - lm2.penalty_away_score) THEN 1 ELSE 0 END)
             + (CASE WHEN pr.penalty_home_score = lm2.penalty_home_score AND pr.penalty_away_score = lm2.penalty_away_score THEN 1 ELSE 0 END)
          ELSE 0
        END)
    ) AS pts,
    COUNT(*) AS pred_count,
    SUM(CASE WHEN lm2.home_score IS NULL OR lm2.away_score IS NULL THEN 0
             WHEN pr.home_score = lm2.home_score AND pr.away_score = lm2.away_score THEN 1 ELSE 0 END) AS exact_count,
    SUM(CASE WHEN lm2.home_score IS NULL OR lm2.away_score IS NULL THEN 0
             WHEN pr.home_score = lm2.home_score AND pr.away_score = lm2.away_score THEN 0
             WHEN SIGN(pr.home_score - pr.away_score) = SIGN(lm2.home_score - lm2.away_score) THEN 1 ELSE 0 END) AS correct_count,
    SUM(CASE WHEN lm2.home_score IS NULL OR lm2.away_score IS NULL THEN 0
             ELSE ABS(pr.home_score - lm2.home_score) + ABS(pr.away_score - lm2.away_score) END) AS goal_diff_sum
  FROM predictions pr
  INNER JOIN live_matches lm2 ON lm2.match_id = pr.match_id
  GROUP BY pr.tenant_id, pr.user_id
),
boost_pts AS (
  SELECT bp.tenant_id, bp.user_id,
    SUM(CASE
      WHEN br.result_team_code   IS NOT NULL AND bp.predicted_team_code   = ANY(string_to_array(br.result_team_code, ','))   THEN ba.points_value
      WHEN br.result_player_name IS NOT NULL AND bp.predicted_player_name = ANY(string_to_array(br.result_player_name, ',')) THEN ba.points_value
      ELSE 0
    END) AS pts,
    COUNT(*) AS pred_count
  FROM boost_predictions bp
  INNER JOIN boost_awards ba ON ba.id = bp.award_id
  LEFT JOIN boost_results br ON br.award_id = bp.award_id
  GROUP BY bp.tenant_id, bp.user_id
),
custom_pts AS (
  SELECT cb.tenant_id, cbp.user_id,
    SUM(CASE
      WHEN cbr.result_team_code   IS NOT NULL AND cbp.predicted_team_code   = ANY(string_to_array(cbr.result_team_code, ','))   THEN cb.points_value
      WHEN cbr.result_player_name IS NOT NULL AND cbp.predicted_player_name = ANY(string_to_array(cbr.result_player_name, ',')) THEN cb.points_value
      ELSE 0
    END) AS pts,
    COUNT(*) AS pred_count
  FROM tenant_custom_boost_predictions cbp
  INNER JOIN tenant_custom_boosts cb ON cb.id = cbp.custom_boost_id
  LEFT JOIN tenant_custom_boost_results cbr ON cbr.custom_boost_id = cbp.custom_boost_id
  GROUP BY cb.tenant_id, cbp.user_id
),
tenant_rows AS (
  SELECT oi.tenant_id, u.id AS user_id,
    COALESCE(mp.pts, 0) + COALESCE(bp.pts, 0) + COALESCE(cp.pts, 0) AS points,
    COALESCE(mp.exact_count, 0)   AS exact_count,
    COALESCE(mp.correct_count, 0) AS correct_count,
    COALESCE(mp.goal_diff_sum, 0) AS goal_diff_sum,
    COALESCE(mp.pred_count, 0) + COALESCE(bp.pred_count, 0) + COALESCE(cp.pred_count, 0) AS total_picks
  FROM oidc_identities oi
  INNER JOIN public.users u ON u.id = oi.user_id
  LEFT JOIN match_pts  mp ON mp.user_id = u.id AND mp.tenant_id = oi.tenant_id
  LEFT JOIN boost_pts  bp ON bp.user_id = u.id AND bp.tenant_id = oi.tenant_id
  LEFT JOIN custom_pts cp ON cp.user_id = u.id AND cp.tenant_id = oi.tenant_id
),
league_rows AS (
  SELECT lmem.league_id, lmem.user_id,
    COALESCE(mp.pts, 0) + COALESCE(bp.pts, 0) + COALESCE(cp.pts, 0) AS points,
    COALESCE(mp.exact_count, 0)   AS exact_count,
    COALESCE(mp.correct_count, 0) AS correct_count,
    COALESCE(mp.goal_diff_sum, 0) AS goal_diff_sum,
    COALESCE(mp.pred_count, 0) + COALESCE(bp.pred_count, 0) + COALESCE(cp.pred_count, 0) AS total_picks
  FROM league_members lmem
  INNER JOIN leagues l ON l.id = lmem.league_id
  LEFT JOIN match_pts  mp ON mp.user_id = lmem.user_id AND mp.tenant_id = l.tenant_id
  LEFT JOIN boost_pts  bp ON bp.user_id = lmem.user_id AND bp.tenant_id = l.tenant_id
  LEFT JOIN custom_pts cp ON cp.user_id = lmem.user_id AND cp.tenant_id = l.tenant_id
),
tenant_digests AS (
  SELECT 'T'::text AS kind, tenant_id::text AS id,
         md5(string_agg(user_id::text || ':' || points || ':' || exact_count || ':' || correct_count || ':' || goal_diff_sum || ':' || total_picks,
                        '|' ORDER BY user_id)) AS digest
  FROM tenant_rows GROUP BY tenant_id
),
league_digests AS (
  SELECT 'L'::text AS kind, league_id::text AS id,
         md5(string_agg(user_id::text || ':' || points || ':' || exact_count || ':' || correct_count || ':' || goal_diff_sum || ':' || total_picks,
                        '|' ORDER BY user_id)) AS digest
  FROM league_rows GROUP BY league_id
),
all_digests AS (
  SELECT kind, id, digest FROM tenant_digests
  UNION ALL
  SELECT kind, id, digest FROM league_digests
)
SELECT 'ALL' AS kind, COUNT(*)::text AS id, md5(string_agg(kind || ':' || id || ':' || digest, '|' ORDER BY kind, id)) AS digest
FROM all_digests
UNION ALL
SELECT kind, id, digest FROM all_digests
ORDER BY kind, id;
