-- Remove two boost awards Luke didn't want in the default roster.
-- Cascades to boost_results and boost_predictions via the FK constraints,
-- so any test predictions/results already created for these get cleaned up.
-- Idempotent via IN (...) — safe to re-run.

DELETE FROM public.boost_awards WHERE slug IN ('wooden-spoon', 'entertaining');
