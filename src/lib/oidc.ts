// PKCE utilities for OIDC authentication

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

// Session storage keys for PKCE flow
const PKCE_VERIFIER_KEY = 'oidc_code_verifier';
const PKCE_STATE_KEY = 'oidc_state';
const PKCE_TENANT_KEY = 'oidc_tenant_id';

/**
 * Store PKCE parameters in session storage
 */
export function storePKCEParams(verifier: string, state: string, tenantId: string): void {
  sessionStorage.setItem(PKCE_VERIFIER_KEY, verifier);
  sessionStorage.setItem(PKCE_STATE_KEY, state);
  sessionStorage.setItem(PKCE_TENANT_KEY, tenantId);
}

/**
 * Retrieve and clear PKCE parameters from session storage
 */
export function retrievePKCEParams(): { verifier: string; state: string; tenantId: string } | null {
  const verifier = sessionStorage.getItem(PKCE_VERIFIER_KEY);
  const state = sessionStorage.getItem(PKCE_STATE_KEY);
  const tenantId = sessionStorage.getItem(PKCE_TENANT_KEY);

  if (!verifier || !state || !tenantId) {
    return null;
  }

  // Clear after retrieval
  sessionStorage.removeItem(PKCE_VERIFIER_KEY);
  sessionStorage.removeItem(PKCE_STATE_KEY);
  sessionStorage.removeItem(PKCE_TENANT_KEY);

  return { verifier, state, tenantId };
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

  // Store PKCE params for callback
  storePKCEParams(codeVerifier, state, tenantId);

  const url = new URL(authUrl);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('scope', 'openid profile email');
  url.searchParams.set('state', state);
  url.searchParams.set('code_challenge', codeChallenge);
  url.searchParams.set('code_challenge_method', 'S256');

  return url.toString();
}
