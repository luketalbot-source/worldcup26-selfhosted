// Roster cache for the boost player-picker, keyed PER COMPETITION.
//
// One singleton fetch per competition shared across every mounted
// PlayerPicker. Without it, a Boost view with 4 player-type cards would
// each issue its own /api/players request on first render — same
// 1.3k-row JSON four times, 4× the latency, 4× the bandwidth, no cache
// coherency between them.
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
import { useCompetitionsSafe } from '@/contexts/CompetitionContext';

export interface Player {
  id: string;
  team_code: string;
  full_name: string;
  position: string | null;
  shirt_number: number | null;
  date_of_birth: string | null;
}

// '' key = unscoped (legacy/all competitions — admin surfaces).
const cachedPromises = new Map<string, Promise<Player[]>>();
const subscribers = new Set<(slug: string, p: Player[]) => void>();

function fetchOnce(slug: string): Promise<Player[]> {
  let cached = cachedPromises.get(slug);
  if (!cached) {
    const path = slug ? `/players?competition=${encodeURIComponent(slug)}` : '/players';
    cached = api.get<Player[]>(path).catch((err) => {
      // On failure, clear the cache so the next caller retries. Avoids
      // a transient API hiccup permanently breaking the picker for the
      // rest of the session.
      cachedPromises.delete(slug);
      throw err;
    });
    cachedPromises.set(slug, cached);
  }
  return cached;
}

/** Drop every cached roster and notify subscribers to re-fetch. */
export function refreshPlayers(): void {
  const slugs = [...cachedPromises.keys()];
  cachedPromises.clear();
  for (const slug of slugs.length > 0 ? slugs : ['']) {
    void fetchOnce(slug).then((rows) => {
      for (const fn of subscribers) fn(slug, rows);
    });
  }
}

export function useQualifiedPlayers(): {
  players: Player[];
  loading: boolean;
  error: string | null;
} {
  // Scope the roster to the ACTIVE competition — club competitions' squads
  // would otherwise merge with the WC archive's (and colliding TLAs like
  // 'POR' would cross-pollinate the type-ahead). Falls back to unscoped
  // outside a CompetitionProvider (admin surfaces).
  const ctx = useCompetitionsSafe();
  const slug = ctx?.activeCompetition?.slug ?? '';
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchOnce(slug)
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

    const onUpdate = (updatedSlug: string, rows: Player[]) => {
      if (!cancelled && updatedSlug === slug) setPlayers(rows);
    };
    subscribers.add(onUpdate);
    return () => {
      cancelled = true;
      subscribers.delete(onUpdate);
    };
  }, [slug]);

  return { players, loading, error };
}
