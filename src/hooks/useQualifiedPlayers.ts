// Roster cache for the boost player-picker.
//
// One singleton fetch shared across every mounted PlayerPicker. Without
// it, a Boost view with 4 player-type cards would each issue its own
// /api/players request on first render — same 1.3k-row JSON four times,
// 4× the latency, 4× the bandwidth, no cache coherency between them.
//
// The cache is a Promise (not a settled value), so callers that arrive
// during the in-flight fetch await the same network request rather than
// kicking off duplicates. Once resolved, every subsequent caller gets
// the same already-fetched array.
//
// Imperative `refreshPlayers()` invalidates the cache after an admin
// import succeeds — next read re-fetches from the server.

import { useEffect, useState } from 'react';
import { api } from '@/lib/apiClient';

export interface Player {
  id: string;
  team_code: string;
  full_name: string;
  position: string | null;
  shirt_number: number | null;
  date_of_birth: string | null;
}

let cachedPromise: Promise<Player[]> | null = null;
const subscribers = new Set<(p: Player[]) => void>();

function fetchOnce(): Promise<Player[]> {
  if (!cachedPromise) {
    cachedPromise = api.get<Player[]>('/players').catch((err) => {
      // On failure, clear the cache so the next caller retries. Avoids
      // a transient API hiccup permanently breaking the picker for the
      // rest of the session.
      cachedPromise = null;
      throw err;
    });
  }
  return cachedPromise;
}

/** Drop the cached promise and notify subscribers to re-render with fresh data. */
export function refreshPlayers(): void {
  cachedPromise = null;
  void fetchOnce().then((rows) => {
    for (const fn of subscribers) fn(rows);
  });
}

export function useQualifiedPlayers(): {
  players: Player[];
  loading: boolean;
  error: string | null;
} {
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchOnce()
      .then((rows) => {
        if (!cancelled) {
          setPlayers(rows);
          setError(null);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
          setPlayers([]);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    const onUpdate = (rows: Player[]) => {
      if (!cancelled) setPlayers(rows);
    };
    subscribers.add(onUpdate);
    return () => {
      cancelled = true;
      subscribers.delete(onUpdate);
    };
  }, []);

  return { players, loading, error };
}
