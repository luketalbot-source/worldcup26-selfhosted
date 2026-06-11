import { useEffect, useState, useCallback, useRef } from 'react';
import { fetchLeaderboard, type LeaderboardEntry } from '@/lib/leaderboardCache';

export type { LeaderboardEntry } from '@/lib/leaderboardCache';

interface UsePaginatedLeaderboardOptions {
  tenantId: string | null;
  pageSize?: number;
  currentUserId?: string;
}

interface UsePaginatedLeaderboardResult {
  entries: LeaderboardEntry[];
  currentUserEntry: LeaderboardEntry | null;
  loading: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  totalCount: number;
  loadMore: () => void;
  refetch: () => void;
}

export const usePaginatedLeaderboard = ({
  tenantId,
  pageSize = 50,
  currentUserId,
}: UsePaginatedLeaderboardOptions): UsePaginatedLeaderboardResult => {
  const [allEntries, setAllEntries] = useState<LeaderboardEntry[]>([]);
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [currentUserEntry, setCurrentUserEntry] = useState<LeaderboardEntry | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [displayedCount, setDisplayedCount] = useState(pageSize);
  const fetchedRef = useRef(false);

  const loadLeaderboard = useCallback(async (force = false) => {
    if (!tenantId) {
      setAllEntries([]);
      setEntries([]);
      setCurrentUserEntry(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    fetchedRef.current = true;

    // Already sorted by rank from the API; mapping happens in the shared
    // cache layer so useLeaderboard and this hook share one request.
    let allEntriesData: LeaderboardEntry[];
    try {
      allEntriesData = await fetchLeaderboard(tenantId, { force });
    } catch (err) {
      console.error('Error fetching leaderboard:', err);
      setLoading(false);
      return;
    }

    if (allEntriesData.length === 0) {
      setAllEntries([]);
      setEntries([]);
      setCurrentUserEntry(null);
      setLoading(false);
      return;
    }

    setAllEntries(allEntriesData);
    setEntries(allEntriesData.slice(0, pageSize));
    setDisplayedCount(pageSize);

    // Find current user entry
    if (currentUserId) {
      const userEntry = allEntriesData.find(e => e.userId === currentUserId);
      setCurrentUserEntry(userEntry || null);
    }

    setLoading(false);
  }, [tenantId, pageSize, currentUserId]);

  useEffect(() => {
    if (tenantId && !fetchedRef.current) {
      loadLeaderboard();
    }
  }, [tenantId, loadLeaderboard]);

  // Reset when tenant changes
  useEffect(() => {
    fetchedRef.current = false;
    setDisplayedCount(pageSize);
  }, [tenantId, pageSize]);

  const loadMore = useCallback(() => {
    if (loadingMore || displayedCount >= allEntries.length) return;

    setLoadingMore(true);

    // Simulate slight delay for UX
    setTimeout(() => {
      const newCount = Math.min(displayedCount + pageSize, allEntries.length);
      setEntries(allEntries.slice(0, newCount));
      setDisplayedCount(newCount);
      setLoadingMore(false);
    }, 100);
  }, [loadingMore, displayedCount, allEntries, pageSize]);

  const refetch = useCallback(() => {
    fetchedRef.current = false;
    loadLeaderboard(true);
  }, [loadLeaderboard]);

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
