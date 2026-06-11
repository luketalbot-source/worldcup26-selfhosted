import { useEffect, useState } from 'react';
import { fetchLeaderboard, type LeaderboardEntry } from '@/lib/leaderboardCache';

interface UseLeaderboardOptions {
  tenantId: string | null;
}

export const useLeaderboard = (optionsOrTenantId: UseLeaderboardOptions | string | null) => {
  // Support both old (tenantId string) and new (options object) signatures
  const isOptionsObject = optionsOrTenantId !== null && typeof optionsOrTenantId === 'object';
  const tenantId: string | null = isOptionsObject
    ? (optionsOrTenantId as UseLeaderboardOptions).tenantId
    : (optionsOrTenantId as string | null);

  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (tenantId) {
      load();
    }
  }, [tenantId]);

  const load = async (force = false) => {
    if (!tenantId) {
      setLeaderboard([]);
      setLoading(false);
      return;
    }

    setLoading(true);

    try {
      setLeaderboard(await fetchLeaderboard(tenantId, { force }));
    } catch (error) {
      console.error('Error fetching leaderboard:', error);
    } finally {
      setLoading(false);
    }
  };

  return { leaderboard, loading, refetch: () => load(true) };
};
