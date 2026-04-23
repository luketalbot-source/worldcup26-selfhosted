-- Upgrade tenant_oidc_config to full OIDC spec (auto-discovery compatible)
--
-- The original Supabase-era schema only had auth_url / client_id / redirect_uri,
-- which is insufficient for authorization-code flow (needs token_endpoint,
-- userinfo_endpoint) and id-token verification (needs jwks_uri + issuer).
--
-- The backend PATCH endpoint now accepts just {issuer, client_id, client_secret,
-- redirect_uri} and fetches the IdP's /.well-known/openid-configuration to
-- populate the rest automatically.
--
-- Safe to run: the table was empty at migration time.

ALTER TABLE public.tenant_oidc_config
  RENAME COLUMN auth_url TO authorization_endpoint;

ALTER TABLE public.tenant_oidc_config
  ADD COLUMN IF NOT EXISTS client_secret     TEXT,
  ADD COLUMN IF NOT EXISTS token_endpoint    TEXT,
  ADD COLUMN IF NOT EXISTS userinfo_endpoint TEXT,
  ADD COLUMN IF NOT EXISTS jwks_uri          TEXT,
  ADD COLUMN IF NOT EXISTS consent_required  BOOLEAN NOT NULL DEFAULT false;

-- issuer becomes required (it's the discovery anchor)
-- Any existing rows (none at time of writing) would need to be backfilled first.
ALTER TABLE public.tenant_oidc_config
  ALTER COLUMN issuer SET NOT NULL;
