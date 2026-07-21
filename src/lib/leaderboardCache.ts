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
  // Detail columns (Top-3-predictors card). Default 0 against an older API
  // that doesn't send them yet (deploy skew). Identity:
  // points = 3*exactCount + correctCount + pensPoints + boostPoints.
  exactCount: number;
  correctCount: number;
  boostPoints: number;
  pensPoints: number;
}

interface ApiLeaderboardEntry {
  user_id: string;
  display_name: string;
  avatar_emoji: string;
  points: number;
  total_predictions: number;
  rank: number;
  exact_count?: number;
  correct_count?: number;
  boost_points?: number;
  pens_points?: number;
}

const LEADERBOARD_TTL_MS = 15_000;

export async function fetchLeaderboard(
  tenantId: string,
  { force = false, competitionId }: { force?: boolean; competitionId?: string | null } = {},
): Promise<LeaderboardEntry[]> {
  const data = await cachedGet<ApiLeaderboardEntry[]>('/leaderboard', {
    params: {
      tenant_id: tenantId,
      // Per-game scoping: the "Everyone" board resets for each competition
      // rather than summing across games. Absent = combined (legacy).
      ...(competitionId ? { competition_id: competitionId } : {}),
    },
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
    exactCount: entry.exact_count ?? 0,
    correctCount: entry.correct_count ?? 0,
    boostPoints: entry.boost_points ?? 0,
    pensPoints: entry.pens_points ?? 0,
  }));
}
