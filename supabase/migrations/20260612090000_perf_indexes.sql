-- Leaderboard / league query indexes + ANALYZE.

-- Composite index on predictions supersedes the single-column tenant_id index.
CREATE INDEX IF NOT EXISTS idx_predictions_tenant_user
  ON public.predictions (tenant_id, user_id);

DROP INDEX IF EXISTS public.idx_predictions_tenant_id; -- superseded: composite leads with tenant_id

-- boost_predictions: was seq-scanning 59K rows per leaderboard request.
CREATE INDEX IF NOT EXISTS idx_boost_predictions_tenant_user
  ON public.boost_predictions (tenant_id, user_id);

-- Remaining filter/join columns with no indexes.
CREATE INDEX IF NOT EXISTS idx_tenant_custom_boosts_tenant_id
  ON public.tenant_custom_boosts (tenant_id);

CREATE INDEX IF NOT EXISTS idx_tenant_custom_boost_predictions_custom_boost_id
  ON public.tenant_custom_boost_predictions (custom_boost_id);

CREATE INDEX IF NOT EXISTS idx_league_members_user_id
  ON public.league_members (user_id);

CREATE INDEX IF NOT EXISTS idx_leagues_tenant_id
  ON public.leagues (tenant_id);

CREATE INDEX IF NOT EXISTS idx_oidc_identities_user_id
  ON public.oidc_identities (user_id);

-- Refresh planner statistics — stale after today's container restarts.
ANALYZE public.predictions;
ANALYZE public.boost_predictions;
ANALYZE public.tenant_custom_boosts;
ANALYZE public.tenant_custom_boost_predictions;
ANALYZE public.league_members;
ANALYZE public.leagues;
ANALYZE public.oidc_identities;
