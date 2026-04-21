import { useEffect, useState } from 'react';
import { api } from '@/lib/apiClient';

interface LeaderboardEntry {
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
      fetchLeaderboard();
    }
  }, [tenantId]);

  const fetchLeaderboard = async () => {
    if (!tenantId) {
      setLeaderboard([]);
      setLoading(false);
      return;
    }

    setLoading(true);

    const { data, error } = await api.get<ApiLeaderboardEntry[]>('/leaderboard', {
      tenant_id: tenantId,
    });

    if (error) {
      console.error('Error fetching leaderboard:', error);
      setLoading(false);
      return;
    }

    const entries: LeaderboardEntry[] = (data || []).map(entry => ({
      rank: entry.rank,
      userId: entry.user_id,
      displayName: entry.display_name,
      avatarEmoji: entry.avatar_emoji || '👤',
      totalPredictions: entry.total_predictions,
      points: entry.points,
    }));

    setLeaderboard(entries);
    setLoading(false);
  };

  return { leaderboard, loading, refetch: fetchLeaderboard };
};
