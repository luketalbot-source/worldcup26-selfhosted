-- User-deletion cascades for every user-keyed table that lacked them.
--
-- Incident (2026-06-11, Südpack): an admin deleted a user via the admin
-- panel; predictions/profiles/refresh_tokens cascaded away, but
-- oidc_identities has no user_id FK, so the identity row survived as an
-- orphan. Every subsequent SSO login for that person resolved the
-- orphaned identity, found no user row behind it, and crashed the
-- callback with a 500 — the account was permanently bricked (8 orphans
-- across 5 tenants at time of writing).
--
-- boost_predictions / league_members / tenant_custom_boost_predictions
-- had the same gap (0 orphans today, but the same admin-delete would
-- create them). load_test_* tables are dev-only and intentionally
-- skipped.
--
-- FKs reference auth.users because public.users is a VIEW over it
-- (the Supabase-era shim); refresh_tokens already follows this pattern.

-- 1) Clean existing orphans so the constraints can be added.
DELETE FROM public.oidc_identities x
 WHERE NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = x.user_id);
DELETE FROM public.boost_predictions x
 WHERE NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = x.user_id);
DELETE FROM public.league_members x
 WHERE NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = x.user_id);
DELETE FROM public.tenant_custom_boost_predictions x
 WHERE NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = x.user_id);

-- 2) Add the missing FKs (idempotent via conname checks).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'oidc_identities_user_id_fkey') THEN
    ALTER TABLE public.oidc_identities
      ADD CONSTRAINT oidc_identities_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'boost_predictions_user_id_fkey') THEN
    ALTER TABLE public.boost_predictions
      ADD CONSTRAINT boost_predictions_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'league_members_user_id_fkey') THEN
    ALTER TABLE public.league_members
      ADD CONSTRAINT league_members_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tenant_custom_boost_predictions_user_id_fkey') THEN
    ALTER TABLE public.tenant_custom_boost_predictions
      ADD CONSTRAINT tenant_custom_boost_predictions_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;
END $$;
