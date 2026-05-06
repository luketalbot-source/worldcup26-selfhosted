-- Email-allowlist admin login.
--
-- Replaces the open dev-login flow. The admin enters their email; if it's
-- in the ADMIN_EMAILS env var, we mint a 6-digit code, hash it, store it
-- here, and email it via Resend. The admin enters the code; we hash and
-- compare, mark used, mint an admin JWT.
--
-- Doubles as an audit trail — every login attempt (whether successful or
-- not) leaves a row. Failed verifies don't get a row of their own; they're
-- counted via the existing row's `failed_verify_count`.
--
-- We never store the raw code, only its sha256 hash. That way a DB leak
-- doesn't grant admin access to anyone — they'd still need the code as
-- delivered to the email inbox during the 10-minute window.

CREATE TABLE IF NOT EXISTS public.admin_login_codes (
  id                   UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Email is stored lowercased so case-mismatch in the allowlist or input
  -- can't create duplicate active codes for the same person.
  email                TEXT         NOT NULL,
  code_hash            TEXT         NOT NULL,
  -- Default 10-minute window; tweak in code if needed without a migration.
  expires_at           TIMESTAMPTZ  NOT NULL,
  used_at              TIMESTAMPTZ,
  failed_verify_count  INTEGER      NOT NULL DEFAULT 0,
  -- Lightweight forensic context for any post-hoc review.
  ip_address           TEXT,
  user_agent           TEXT,
  created_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Lookups always come keyed by email + recency (find the most recent
-- unused code for a given email). DESC index keeps that hot path fast.
CREATE INDEX IF NOT EXISTS idx_admin_login_codes_email_created_at
  ON public.admin_login_codes (email, created_at DESC);

-- Periodic cleanup of expired/used codes can use this index. Not critical
-- for security (we always check expires_at + used_at at verify time), but
-- keeps the table small.
CREATE INDEX IF NOT EXISTS idx_admin_login_codes_expires_at
  ON public.admin_login_codes (expires_at)
  WHERE used_at IS NULL;
