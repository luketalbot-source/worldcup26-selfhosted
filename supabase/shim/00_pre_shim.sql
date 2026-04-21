-- Pre-migration shim: replicates the parts of Supabase auth that the
-- schema/RLS policies depend on, so the original migrations can run
-- against a self-hosted Postgres without modification.

-- 1. auth schema
CREATE SCHEMA IF NOT EXISTS auth;

-- 2. Minimal auth.users table (columns referenced by migrations/triggers + API)
CREATE TABLE IF NOT EXISTS auth.users (
  id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  email              TEXT        UNIQUE,
  phone              TEXT        UNIQUE,
  display_name       TEXT,
  raw_user_meta_data JSONB       DEFAULT '{}'::jsonb,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. auth.uid() shim — reads the current request's user id out of a
--    session-local GUC that the API sets at the start of each transaction
--    via `SELECT set_config('app.current_user_id', '<uuid>', true)`.
CREATE OR REPLACE FUNCTION auth.uid()
RETURNS UUID
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(current_setting('app.current_user_id', true), '')::uuid
$$;

-- 4. auth.jwt() shim — some RLS policies may use this. Returns empty JSON.
CREATE OR REPLACE FUNCTION auth.jwt()
RETURNS JSONB
LANGUAGE sql
STABLE
AS $$
  SELECT '{}'::jsonb
$$;

-- Required extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Supabase pre-defined roles that migrations GRANT to.
-- Create them as NOLOGIN so they're purely name targets for GRANTs.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    CREATE ROLE service_role NOLOGIN;
  END IF;
END$$;
