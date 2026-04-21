import { useEffect, useState, useCallback, useRef } from 'react';
import { api } from '@/lib/apiClient';

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

  const fetchLeaderboard = useCallback(async () => {
    if (!tenantId) {
      setAllEntries([]);
      setEntries([]);
      setCurrentUserEntry(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    fetchedRef.current = true;

    const { data, error } = await api.get<ApiLeaderboardEntry[]>('/leaderboard', {
      tenant_id: tenantId,
    });

    if (error) {
      console.error('Error fetching leaderboard:', error);
      setLoading(false);
      return;
    }

    if (!data || data.length === 0) {
      setAllEntries([]);
      setEntries([]);
      setCurrentUserEntry(null);
      setLoading(false);
      return;
    }

    // Map to local shape, already sorted by rank from API
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

    // Find current user entry
    if (currentUserId) {
      const userEntry = allEntriesData.find(e => e.userId === currentUserId);
      setCurrentUserEntry(userEntry || null);
    }

    setLoading(false);
  }, [tenantId, pageSize, currentUserId]);

  useEffect(() => {
    if (tenantId && !fetchedRef.current) {
      fetchLeaderboard();
    }
  }, [tenantId, fetchLeaderboard]);

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
