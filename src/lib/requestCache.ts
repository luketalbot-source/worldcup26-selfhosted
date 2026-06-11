// Module-scope GET cache with inflight dedupe — the useTeams ensureLoad
// pattern, generalised to keyed endpoints. Concurrent callers share one
// in-flight request, and repeat callers inside the TTL get the cached
// body without touching the network. Callers that must see fresh data
// (explicit user refresh) pass { force: true }.

import { api } from './apiClient';

interface CacheEntry {
  data: unknown;
  fetchedAt: number;
}

const cache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<unknown>>();

function keyFor(path: string, params?: Record<string, string | undefined>): string {
  const search = new URLSearchParams();
  for (const [k, v] of Object.entries(params ?? {})) {
    if (v !== undefined) search.set(k, v);
  }
  return `${path}?${search.toString()}`;
}

export function cachedGet<T>(
  path: string,
  {
    params,
    ttlMs,
    force = false,
  }: {
    params?: Record<string, string | undefined>;
    ttlMs: number;
    force?: boolean;
  },
): Promise<T> {
  const key = keyFor(path, params);

  if (!force) {
    const hit = cache.get(key);
    if (hit && Date.now() - hit.fetchedAt < ttlMs) {
      return Promise.resolve(hit.data as T);
    }
    const pending = inflight.get(key);
    if (pending) return pending as Promise<T>;
  }

  const p = api
    .get<T>(path, params)
    .then((data) => {
      cache.set(key, { data, fetchedAt: Date.now() });
      return data;
    })
    .finally(() => {
      // Only clear if we're still the registered request — a forced
      // refetch may have replaced us in the meantime.
      if (inflight.get(key) === p) inflight.delete(key);
    });
  inflight.set(key, p);
  return p;
}
