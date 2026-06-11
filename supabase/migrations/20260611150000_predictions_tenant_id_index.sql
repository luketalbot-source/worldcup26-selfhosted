-- Index for predictions.tenant_id.
--
-- The tenant by-uid resolve (every app mount) computes user_count via a
-- UNION that filters predictions by tenant_id — which had NO index and
-- seq-scanned the whole table on every call. Harmless in the test era;
-- at 726K prediction rows and matchday login-surge rates (June 11) the
-- stacked 395ms scans exhausted the API's DB pool, slowed the whole
-- app, and starved /api/stats/tournament into Envoy 503s.
--
-- Applied to prod 2026-06-11 via CREATE INDEX CONCURRENTLY (the
-- non-CONCURRENT form here is fine for fresh environments; IF NOT
-- EXISTS makes it a no-op on prod).

CREATE INDEX IF NOT EXISTS idx_predictions_tenant_id
  ON public.predictions (tenant_id);
