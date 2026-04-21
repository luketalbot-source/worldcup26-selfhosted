// src/lib/apiClient.ts
import { getAccessToken, setAccessToken, clearAccessToken } from './auth';

const API_BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? '/api';

export type ApiResult<T> = { data: T; error: null } | { data: null; error: Error };

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
): Promise<ApiResult<T>> {
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

  try {
    let res = await makeRequest();

    if (res.status === 401) {
      const refreshed = await refreshToken();
      if (!refreshed) return { data: null, error: new Error('Unauthorized') };
      res = await makeRequest();
    }

    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: res.statusText })) as { error?: string };
      return { data: null, error: new Error(body.error ?? res.statusText) };
    }

    const data = res.status === 204 ? (null as T) : (await res.json() as T);
    return { data, error: null };
  } catch (err) {
    return { data: null, error: err instanceof Error ? err : new Error(String(err)) };
  }
}

export const api = {
  get:    <T>(path: string, params?: Record<string, string | undefined>) =>
            request<T>('GET', path, { params }),
  post:   <T>(path: string, body?: unknown) =>
            request<T>('POST', path, { body }),
  patch:  <T>(path: string, body?: unknown) =>
            request<T>('PATCH', path, { body }),
  delete: <T = { success: boolean }>(path: string) =>
            request<T>('DELETE', path),
};
