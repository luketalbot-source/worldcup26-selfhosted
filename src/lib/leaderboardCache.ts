// Shared fetch layer for GET /leaderboard — the hottest backend endpoint.
// useLeaderboard and usePaginatedLeaderboard are routinely mounted at the
// same time (LeaguesView + LeaderboardView), so both go through this one
// module-scope cache instead of each firing their own request.

import { cachedGet } from './requestCache';

export interface LeaderboardEntry {
  rank: number;
  userId: string;
  displayName: string;
  avatarEmoji: string;
  totalPredictions: number;
  points: number;
}

interface ApiLeaderboardEntry {
  user_id: string;
  display_name: string;
  avatar_emoji: string;
  points: number;
  total_predictions: number;
  rank: number;
}

const LEADERBOARD_TTL_MS = 15_000;

export async function fetchLeaderboard(
  tenantId: string,
  { force = false }: { force?: boolean } = {},
): Promise<LeaderboardEntry[]> {
  const data = await cachedGet<ApiLeaderboardEntry[]>('/leaderboard', {
    params: { tenant_id: tenantId },
    ttlMs: LEADERBOARD_TTL_MS,
    force,
  });

  return (data ?? []).map((entry) => ({
    rank: entry.rank,
    userId: entry.user_id,
    displayName: entry.display_name,
    avatarEmoji: entry.avatar_emoji || '👤',
    totalPredictions: entry.total_predictions,
    points: entry.points,
  }));
}
