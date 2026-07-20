import { useEffect, useState } from 'react';
import { fetchLeaderboard, type LeaderboardEntry } from '@/lib/leaderboardCache';

interface UseLeaderboardOptions {
  tenantId: string | null;
  /** Scope points to one competition (the per-game "Everyone" board).
   *  Absent/null = combined across every competition. */
  competitionId?: string | null;
}

export const useLeaderboard = (optionsOrTenantId: UseLeaderboardOptions | string | null) => {
  // Support both old (tenantId string) and new (options object) signatures
  const isOptionsObject = optionsOrTenantId !== null && typeof optionsOrTenantId === 'object';
  const tenantId: string | null = isOptionsObject
    ? (optionsOrTenantId as UseLeaderboardOptions).tenantId
    : (optionsOrTenantId as string | null);
  const competitionId: string | null = isOptionsObject
    ? (optionsOrTenantId as UseLeaderboardOptions).competitionId ?? null
    : null;

  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (tenantId) {
      load();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId, competitionId]);

  const load = async (force = false) => {
    if (!tenantId) {
      setLeaderboard([]);
      setLoading(false);
      return;
    }

    setLoading(true);

    try {
      setLeaderboard(await fetchLeaderboard(tenantId, { force, competitionId }));
    } catch (error) {
      console.error('Error fetching leaderboard:', error);
    } finally {
      setLoading(false);
    }
  };

  return { leaderboard, loading, refetch: () => load(true) };
};
