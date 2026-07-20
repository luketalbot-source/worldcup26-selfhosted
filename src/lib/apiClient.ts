// src/lib/apiClient.ts
//
// Contract: api.get/post/patch/delete return the raw response body (typed as T)
// on success, and throw `ApiError` on failure. Callers that care about the
// error use try/catch; fire-and-forget callers can ignore the return.
//
// The previous `{data, error}` wrapper caused widespread bugs because many
// callers treated the wrapper as the raw body and quietly consumed stale
// undefined values. Raw-body-or-throw matches the idiom the majority of
// call sites already assumed.

import { getAccessToken, setAccessToken, clearAccessToken } from './auth';

const API_BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? '/api';

export class ApiError extends Error {
  status: number;
  body: unknown;
  constructor(message: string, status: number, body: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }
}

async function refreshToken(): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
    });
    if (!res.ok) { clearAccessToken(); return false; }
    const data = await res.json() as { access_token: string };
    setAccessToken(data.access_token);
    return true;
  } catch {
    clearAccessToken();
    return false;
  }
}

// Transient failures we retry for idempotent GETs:
//   - 502 Bad Gateway / 503 Service Unavailable / 504 Gateway Timeout —
//     classic "backend is restarting / proxy overloaded"
//   - fetch throwing (network blip, DNS, TLS reset)
// Non-idempotent methods (POST/PATCH/DELETE) never retry — risk of
// partial-side-effect duplication. 4xx never retries: input's wrong,
// retry won't fix it.
const RETRYABLE_STATUS = new Set([502, 503, 504]);
const RETRY_DELAYS_MS = [250, 750, 1500]; // worst-case total ~2.5s
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function request<T>(
  method: string,
  path: string,
  options: { body?: unknown; params?: Record<string, string | undefined> } = {}
): Promise<T> {
  const url = new URL(`${API_BASE}${path}`, window.location.origin);
  if (options.params) {
    Object.entries(options.params).forEach(([k, v]) => {
      if (v !== undefined) url.searchParams.set(k, v);
    });
  }

  const makeRequest = () => {
    const token = getAccessToken();
    return fetch(url.toString(), {
      method,
      credentials: 'include',
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(options.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });
  };

  // Retry loop for idempotent GETs. First attempt is immediate (delay = 0);
  // subsequent attempts wait per RETRY_DELAYS_MS before re-firing. POST /
  // PATCH / DELETE skip the loop and fire exactly once.
  const canRetry = method === 'GET';
  let res: Response | null = null;
  let lastNetworkError: unknown = null;
  const maxAttempts = canRetry ? RETRY_DELAYS_MS.length + 1 : 1;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (attempt > 0) await sleep(RETRY_DELAYS_MS[attempt - 1]!);
    try {
      res = await makeRequest();
    } catch (err) {
      lastNetworkError = err;
      res = null;
      if (!canRetry) throw err;
      continue;
    }
    if (!canRetry) break;
    if (!RETRYABLE_STATUS.has(res.status)) break;
  }

  if (!res) {
    // Exhausted retries without a single completed response.
    throw lastNetworkError instanceof Error
      ? lastNetworkError
      : new Error('Network request failed');
  }

  // Transparently try refresh on 401 (except for the refresh endpoint itself,
  // which would loop). Still propagates 401 as a thrown ApiError if refresh fails.
  if (res.status === 401 && !path.startsWith('/auth/refresh')) {
    const refreshed = await refreshToken();
    if (refreshed) {
      res = await makeRequest();
    }
  }

  if (!res.ok) {
    const body = await res.json().catch(() => null) as { error?: string } | null;
    // statusText is the EMPTY STRING over HTTP/2 (no reason phrases), so
    // `body?.error ?? res.statusText` produced blank error messages for
    // any non-JSON failure — e.g. an Envoy 502/504 HTML page during an
    // API deploy. Users then saw "Sign In Failed" with no reason at all
    // (Südpack, June 2026). Always fall back to the numeric status.
    throw new ApiError(
      body?.error || res.statusText || `HTTP ${res.status}`,
      res.status,
      body,
    );
  }

  if (res.status === 204) return null as T;
  return (await res.json()) as T;
}

export const api = {
  get:    <T = unknown>(path: string, params?: Record<string, string | undefined>) =>
            request<T>('GET', path, { params }),
  post:   <T = unknown>(path: string, body?: unknown) =>
            request<T>('POST', path, { body }),
  put:    <T = unknown>(path: string, body?: unknown) =>
            request<T>('PUT', path, { body }),
  patch:  <T = unknown>(path: string, body?: unknown) =>
            request<T>('PATCH', path, { body }),
  delete: <T = unknown>(path: string) =>
            request<T>('DELETE', path),
};
