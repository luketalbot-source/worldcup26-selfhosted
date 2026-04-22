import { useEffect, useState, useRef } from 'react';
import { api } from '@/lib/apiClient';

interface LeagueLeaderboardEntry {
  rank: number;
  userId: string;
  displayName: string;
  avatarEmoji: string;
  totalPredictions: number;
  points: number;
  isCreator: boolean;
}

interface ApiLeaderboardEntry {
  user_id: string;
  display_name: string;
  avatar_emoji: string;
  points: number;
  total_predictions: number;
  rank: number;
}

interface CacheEntry {
  data: LeagueLeaderboardEntry[];
  timestamp: number;
}

// Client-side TTL cache for league leaderboards (30 seconds)
const leaderboardCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 30 * 1000;

export const useLeagueLeaderboard = (leagueId: string | null, creatorId: string | null, tenantId?: string | null) => {
  const [leaderboard, setLeaderboard] = useState<LeagueLeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const fetchingRef = useRef(false);

  useEffect(() => {
    if (leagueId) {
      // Check cache first
      const cached = leaderboardCache.get(leagueId);
      if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
        setLeaderboard(cached.data);
        setLoading(false);
        return;
      }
      fetchLeaderboard();
    } else {
      setLeaderboard([]);
      setLoading(false);
    }
  }, [leagueId]);

  const fetchLeaderboard = async () => {
    if (!leagueId || fetchingRef.current) return;

    fetchingRef.current = true;
    setLoading(true);

    const params: Record<string, string | undefined> = {
      league_id: leagueId,
    };
    if (tenantId) params.tenant_id = tenantId;

    try {
      const data = await api.get<ApiLeaderboardEntry[]>('/leaderboard', params);

      if (!data) {
        setLeaderboard([]);
        return;
      }

      const entries: LeagueLeaderboardEntry[] = data.map(entry => ({
        rank: entry.rank,
        userId: entry.user_id,
        displayName: entry.display_name,
        avatarEmoji: entry.avatar_emoji || '👤',
        totalPredictions: entry.total_predictions,
        points: entry.points,
        isCreator: entry.user_id === creatorId,
      }));

      leaderboardCache.set(leagueId, {
        data: entries,
        timestamp: Date.now(),
      });

      setLeaderboard(entries);
    } catch {
      setLeaderboard([]);
    } finally {
      setLoading(false);
      fetchingRef.current = false;
    }
  };

  const refetch = () => {
    // Clear cache for this league before refetching
    if (leagueId) {
      leaderboardCache.delete(leagueId);
    }
    return fetchLeaderboard();
  };

  return { leaderboard, loading, refetch };
};
