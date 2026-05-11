// PKCE utilities for OIDC authentication

import { api } from './apiClient';

/**
 * Generate a random code verifier for PKCE
 */
export function generateCodeVerifier(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return base64UrlEncode(array);
}

/**
 * Generate a code challenge from a code verifier using SHA-256
 */
export async function generateCodeChallenge(verifier: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return base64UrlEncode(new Uint8Array(digest));
}

/**
 * Base64 URL encode a Uint8Array
 */
function base64UrlEncode(array: Uint8Array): string {
  const base64 = btoa(String.fromCharCode(...array));
  return base64
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/**
 * Generate a random state parameter for OIDC
 */
export function generateState(): string {
  const array = new Uint8Array(16);
  crypto.getRandomValues(array);
  return base64UrlEncode(array);
}

/**
 * Register a fresh PKCE session server-side, keyed by `state`. The
 * backend stores (verifier, tenant_id) with a 15-minute TTL and the
 * callback handler DELETE-RETURNs the row to redeem it.
 *
 * Replaces the old sessionStorage approach (storePKCEParams /
 * retrievePKCEParams) which broke when the Flip iframe was re-mounted
 * between auth-start and callback — browser storage in a third-party
 * iframe context is fragile (Safari ITP, Chrome CHIPS, parent-driven
 * re-mounts). Server-side state survives any client-side lifecycle.
 */
export async function initPKCESession(
  state: string,
  verifier: string,
  tenantId: string,
): Promise<void> {
  await api.post('/auth/oidc/pkce-init', {
    state,
    code_verifier: verifier,
    tenant_id: tenantId,
  });
}

/**
 * Build the OIDC authorization URL
 */
export async function buildAuthorizationUrl(
  authUrl: string,
  clientId: string,
  redirectUri: string,
  tenantId: string
): Promise<string> {
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = await generateCodeChallenge(codeVerifier);
  const state = generateState();

  // Persist PKCE state SERVER-SIDE before redirecting. The callback
  // will look up the verifier by `state`. If this POST fails the
  // whole sign-in attempt fails loudly here, rather than silently
  // landing on the IdP login and then a confusing "session expired".
  await initPKCESession(state, codeVerifier, tenantId);

  const url = new URL(authUrl);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('scope', 'openid profile email');
  url.searchParams.set('state', state);
  url.searchParams.set('code_challenge', codeChallenge);
  url.searchParams.set('code_challenge_method', 'S256');
  // Force Keycloak to put code+state in the query string, not the fragment.
  // Some Keycloak client configurations default to response_mode=fragment
  // which strands the params in the URL hash where React Router can't read
  // them — the callback would always see "Missing authorization code or state".
  url.searchParams.set('response_mode', 'query');

  return url.toString();
}
