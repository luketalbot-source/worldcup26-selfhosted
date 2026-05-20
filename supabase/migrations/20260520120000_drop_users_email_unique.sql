-- Drop the UNIQUE constraint on auth.users.email.
--
-- Identity in this app is (tenant_id, oidc_subject) → user_id, joined
-- via public.oidc_identities. Email is *metadata* — the Flip IdP
-- frequently returns the same email for multiple humans because their
-- whole branch shares a workspace mailbox (e.g. flip@him-gmbh.com,
-- edeka.worpswede@minden.edeka.de). The UNIQUE constraint forced our
-- upsert path to a brittle "merge users with the same email" fallback,
-- which silently collapsed up to 11 distinct OIDC subjects into a
-- single internal user (Rau GmbH ticket 2026-05-20: Marcello & Dina
-- both showing as one name).
--
-- Removing UNIQUE lets the upsert always create a fresh user row per
-- new OIDC sub, with email kept as a non-unique label. Nothing else
-- in the schema joins on auth.users.email.

ALTER TABLE auth.users DROP CONSTRAINT IF EXISTS users_email_key;

-- Keep an index for queries that filter by email (admin-login flows do
-- this) — just no longer a uniqueness constraint.
CREATE INDEX IF NOT EXISTS idx_auth_users_email
  ON auth.users (email);
