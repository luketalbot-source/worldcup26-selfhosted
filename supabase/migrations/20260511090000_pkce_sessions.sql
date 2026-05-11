-- Server-side PKCE state for OIDC sign-in.
--
-- The frontend used to store the code_verifier + state + tenant_id in
-- sessionStorage between the auth-start step (redirect to IdP) and the
-- callback step (exchange code for token). Inside the Flip iframe that's
-- fragile: if the parent re-mounts the iframe or the browser partitions
-- third-party storage between the two steps (Safari ITP, Chrome CHIPS),
-- sessionStorage is gone and the user sees "Session expired".
--
-- This table moves that state server-side, keyed by the `state` URL
-- parameter (which the IdP echoes back unchanged on the callback). The
-- callback handler DELETEs + RETURNs the row, so it's single-use — same
-- CSRF semantics as the old client-side check.
--
-- Rows have a 15-minute TTL. Anything older than that the callback
-- considers expired. A nightly cleanup is overkill at this scale; the
-- expires_at predicate on the callback's DELETE handles it implicitly,
-- and unused rows will accumulate slowly but never produce wrong answers.

CREATE TABLE IF NOT EXISTS public.pkce_sessions (
  state         TEXT        PRIMARY KEY,
  code_verifier TEXT        NOT NULL,
  tenant_id     UUID        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at    TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '15 minutes')
);

CREATE INDEX IF NOT EXISTS idx_pkce_sessions_expires_at
  ON public.pkce_sessions (expires_at);
