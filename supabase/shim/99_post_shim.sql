-- Post-migration shim: create public.users as an updatable view of auth.users
-- so API code that references public.users continues to work against the schema
-- (which has all user FKs pointing to auth.users).
CREATE OR REPLACE VIEW public.users AS
  SELECT id, email, phone, display_name, raw_user_meta_data, created_at, updated_at
  FROM auth.users;

-- refresh_tokens: stores hashed refresh tokens for the custom JWT layer.
-- Supabase handled this internally; on self-hosted, we own it.
CREATE TABLE IF NOT EXISTS public.refresh_tokens (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token_hash TEXT        NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked    BOOLEAN     NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user    ON public.refresh_tokens (user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_hash    ON public.refresh_tokens (token_hash);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_expires ON public.refresh_tokens (expires_at);
