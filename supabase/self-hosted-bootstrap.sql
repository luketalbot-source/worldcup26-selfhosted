-- =============================================================================
-- Self-hosted bootstrap — run BEFORE the Supabase-era migrations.
--
-- The original app was Lovable/Supabase, so the migrations reference
-- `auth.users`, `auth.uid()`, and other Supabase internals. This file stubs
-- those out so everything works on a plain Postgres with our custom JWT API.
--
-- After this bootstrap runs, the existing migrations (20260127* onward) can
-- be applied unmodified. A second setup file (self-hosted-finalise.sql)
-- creates the `public.users` view that our API talks to.
-- =============================================================================

-- pgcrypto provides gen_random_bytes() / gen_random_uuid() used by the
-- original migrations. pgcrypto is a stock extension in every Postgres
-- distribution.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Supabase defines these roles by default. Some migrations GRANT to them.
-- We create them as stubs so GRANT statements succeed. Nobody ever actually
-- logs in with these — all connections come through the 'worldcup26' role.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    CREATE ROLE service_role NOLOGIN;
  END IF;
END
$$;

-- One of the Supabase migrations installs pg_cron into an "extensions"
-- schema. pg_cron itself isn't available on vanilla Postgres, and we don't
-- need it (cleanup jobs run in the Bun server). Create the schema so the
-- later CREATE EXTENSION IF NOT EXISTS ... WITH SCHEMA extensions is a
-- no-op — the migration is still wrapped in a "no-op these out" helper
-- below.
CREATE SCHEMA IF NOT EXISTS extensions;

CREATE SCHEMA IF NOT EXISTS auth;

-- Base user table — mirrors the columns Supabase's auth.users exposes that
-- our migrations / triggers touch. Plenty of other Supabase columns are
-- omitted; we don't use them.
CREATE TABLE IF NOT EXISTS auth.users (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email               TEXT UNIQUE,
  phone               TEXT UNIQUE,
  encrypted_password  TEXT,
  email_confirmed_at  TIMESTAMPTZ,
  phone_confirmed_at  TIMESTAMPTZ,
  display_name        TEXT,
  raw_user_meta_data  JSONB DEFAULT '{}'::jsonb,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Shim of Supabase's auth.uid() — reads the user id the API sets per
-- transaction via withUser() → SET LOCAL app.current_user_id.
CREATE OR REPLACE FUNCTION auth.uid()
RETURNS UUID
LANGUAGE SQL
STABLE
AS $$
  SELECT NULLIF(current_setting('app.current_user_id', true), '')::UUID
$$;

-- Some Supabase policies call auth.role(); keep it simple — always
-- 'authenticated' when a user is set, otherwise 'anon'.
CREATE OR REPLACE FUNCTION auth.role()
RETURNS TEXT
LANGUAGE SQL
STABLE
AS $$
  SELECT CASE
    WHEN NULLIF(current_setting('app.current_user_id', true), '') IS NOT NULL
      THEN 'authenticated'
    ELSE 'anon'
  END
$$;

-- Grant usage so everything referencing auth schema works (postgres superuser
-- can see it regardless, but other roles might exist in future).
GRANT USAGE ON SCHEMA auth TO PUBLIC;
GRANT SELECT ON auth.users TO PUBLIC;

-- is_any_admin(user_id) is referenced by RLS policies on the load-test
-- tables. user_roles doesn't exist yet — it's created later by migration
-- 20260128171118 — but plpgsql only resolves referenced tables at execution
-- time, so this function can be defined against a table that doesn't yet
-- exist. We use EXECUTE to defer name resolution even further, so the
-- function body is safe to parse even when user_roles is missing.
CREATE OR REPLACE FUNCTION public.is_any_admin(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result BOOLEAN;
BEGIN
  EXECUTE format('SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = %L AND role = ''admin''::app_role)', _user_id)
  INTO result;
  RETURN COALESCE(result, false);
EXCEPTION WHEN undefined_table OR undefined_function OR undefined_object THEN
  RETURN false;
END
$$;
