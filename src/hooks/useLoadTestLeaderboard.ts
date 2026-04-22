import { useEffect, useState, useCallback, useRef } from 'react';
import { api } from '@/lib/apiClient';
import { groupStageMatches } from '@/data/matches';
import type { LeaderboardEntry } from './usePaginatedLeaderboard';

const LOAD_TEST_TENANT_ID = 'cb28e2ff-90f5-4aa3-8bb5-6bd6fc9f50b2';
const SIMULATED_USER_RANK = 500; // Simulate being ranked 500th

interface ApiLeaderboardEntry {
  user_id: string;
  display_name: string;
  avatar_emoji: string;
  points: number;
  total_predictions: number;
  rank: number;
}

interface UseLoadTestLeaderboardOptions {
  pageSize?: number;
  enabled?: boolean;
}

interface UseLoadTestLeaderboardResult {
  entries: LeaderboardEntry[];
  currentUserEntry: LeaderboardEntry | null;
  loading: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  totalCount: number;
  loadMore: () => void;
  refetch: () => void;
}

export const useLoadTestLeaderboard = ({
  pageSize = 50,
  enabled = true,
}: UseLoadTestLeaderboardOptions = {}): UseLoadTestLeaderboardResult => {
  const [allEntries, setAllEntries] = useState<LeaderboardEntry[]>([]);
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [currentUserEntry, setCurrentUserEntry] = useState<LeaderboardEntry | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [displayedCount, setDisplayedCount] = useState(pageSize);
  const fetchedRef = useRef(false);

  const fetchLeaderboard = useCallback(async () => {
    setLoading(true);
    fetchedRef.current = true;

    let data: ApiLeaderboardEntry[] | null = null;
    try {
      data = await api.get<ApiLeaderboardEntry[]>('/leaderboard', {
        tenant_id: LOAD_TEST_TENANT_ID,
      });
    } catch {
      data = null;
    }

    if (!data || data.length === 0) {
      setAllEntries([]);
      setEntries([]);
      setCurrentUserEntry(null);
      setLoading(false);
      return;
    }

    // Map to local shape (already sorted by rank from API)
    const allEntriesData: LeaderboardEntry[] = data.map(entry => ({
      rank: entry.rank,
      userId: entry.user_id,
      displayName: entry.display_name,
      avatarEmoji: entry.avatar_emoji || '👤',
      totalPredictions: entry.total_predictions,
      points: entry.points,
    }));

    setAllEntries(allEntriesData);
    setEntries(allEntriesData.slice(0, pageSize));
    setDisplayedCount(pageSize);

    // Simulate current user as the person ranked ~500th (or last if less than 500)
    const simulatedRank = Math.min(SIMULATED_USER_RANK, allEntriesData.length);
    const simulatedUserEntry = allEntriesData[simulatedRank - 1];
    if (simulatedUserEntry) {
      // Mark this entry as "you" by updating the display name
      const markedEntry = {
        ...simulatedUserEntry,
        displayName: simulatedUserEntry.displayName,
      };
      setCurrentUserEntry(markedEntry);
    }

    setLoading(false);
  }, [pageSize]);

  useEffect(() => {
    if (!fetchedRef.current && enabled) {
      fetchLeaderboard();
    }
  }, [fetchLeaderboard, enabled]);

  const loadMore = useCallback(() => {
    if (loadingMore || displayedCount >= allEntries.length) return;

    setLoadingMore(true);

    setTimeout(() => {
      const newCount = Math.min(displayedCount + pageSize, allEntries.length);
      setEntries(allEntries.slice(0, newCount));
      setDisplayedCount(newCount);
      setLoadingMore(false);
    }, 100);
  }, [loadingMore, displayedCount, allEntries, pageSize]);

  const refetch = useCallback(() => {
    fetchedRef.current = false;
    fetchLeaderboard();
  }, [fetchLeaderboard]);

  return {
    entries,
    currentUserEntry,
    loading,
    loadingMore,
    hasMore: displayedCount < allEntries.length,
    totalCount: allEntries.length,
    loadMore,
    refetch,
  };
};
