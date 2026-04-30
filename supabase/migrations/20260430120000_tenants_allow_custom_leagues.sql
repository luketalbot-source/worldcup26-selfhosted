-- Per-tenant feature flag: do users in this tenant get the full leagues
-- experience (create / join custom leagues) or just the built-in
-- "Everyone" league?
--
-- Default TRUE preserves existing behaviour for every tenant on the
-- platform — when a single customer wants the simpler one-league mode,
-- an admin toggles it off in the tenant settings.

ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS allow_custom_leagues BOOLEAN NOT NULL DEFAULT true;
