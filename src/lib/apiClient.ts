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

  let res = await makeRequest();

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
    throw new ApiError(
      body?.error ?? res.statusText ?? 'Request failed',
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
  patch:  <T = unknown>(path: string, body?: unknown) =>
            request<T>('PATCH', path, { body }),
  delete: <T = unknown>(path: string) =>
            request<T>('DELETE', path),
};
