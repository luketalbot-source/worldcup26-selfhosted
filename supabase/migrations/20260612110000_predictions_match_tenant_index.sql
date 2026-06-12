-- Index for the exact-predictions reveal lookup: predictions filtered by
-- (match_id, tenant_id) + score equality. Complements the (tenant_id,
-- user_id) composite from 20260612090000 — different leading column,
-- different query family (per-match reveal vs per-user leaderboard).
--
-- Applied to prod 2026-06-12 via CREATE INDEX CONCURRENTLY.

CREATE INDEX IF NOT EXISTS idx_predictions_match_tenant
  ON public.predictions (match_id, tenant_id);
