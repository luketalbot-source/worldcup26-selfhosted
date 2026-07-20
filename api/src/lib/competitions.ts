// Competition registry access. One competitions row per competition PER
// SEASON (bl1-2026-27, bl1-2027-28, …); is_active drives the sync scheduler
// and UI listing, and archiving a finished season = flipping is_active off —
// the WC2026 archive works exactly this way.

import { sql } from "../db";

export interface Competition {
  id: string;
  slug: string;
  fd_code: string;
  fd_season: number | null;
  season: string;
  name: string;
  short_name: string;
  format: "tournament" | "league" | "hybrid";
  boost_lock_at: string | null;
  is_active: boolean;
  display_order: number;
}

/** The WC2026 row's fixed id — also the literal column DEFAULT used by the
 *  Phase A migrations so old-code inserts stay attributed. */
export const WC_COMPETITION_ID = "a0000000-0000-4000-8000-000000000001";

// Small TTL cache: the registry is read on hot paths (matches, leaderboard)
// but changes only via admin action. Same single-instance caveat as the
// other module-level caches in this API.
let cache: { rows: Competition[]; at: number } | null = null;
const CACHE_TTL_MS = 60_000;

export function invalidateCompetitionsCache(): void {
  cache = null;
}

export async function getAllCompetitions(): Promise<Competition[]> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.rows;
  const rows = await sql<Competition[]>`
    SELECT id, slug, fd_code, fd_season, season, name, short_name, format,
           boost_lock_at, is_active, display_order
      FROM public.competitions
     ORDER BY display_order ASC, slug ASC
  `;
  cache = { rows: [...rows], at: Date.now() };
  return cache.rows;
}

export async function getActiveCompetitions(): Promise<Competition[]> {
  return (await getAllCompetitions()).filter((c) => c.is_active);
}

export async function getCompetitionBySlug(slug: string): Promise<Competition | null> {
  return (await getAllCompetitions()).find((c) => c.slug === slug) ?? null;
}

export async function getCompetitionById(id: string): Promise<Competition | null> {
  return (await getAllCompetitions()).find((c) => c.id === id) ?? null;
}
