import { useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { calculatePredictionPoints } from '@/lib/scoringCalculator';
import { groupStageMatches } from '@/data/matches';
import type { LeaderboardEntry } from './usePaginatedLeaderboard';

const LOAD_TEST_TENANT_ID = 'cb28e2ff-90f5-4aa3-8bb5-6bd6fc9f50b2';
const SIMULATED_USER_RANK = 500; // Simulate being ranked 500th

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

    // Fetch load test profiles
    const { data: profiles, error: profilesError } = await supabase
      .from('load_test_profiles')
      .select('id, user_id, display_name, avatar_emoji')
      .eq('tenant_id', LOAD_TEST_TENANT_ID);

    if (profilesError) {
      setLoading(false);
      return;
    }

    if (!profiles || profiles.length === 0) {
      setAllEntries([]);
      setEntries([]);
      setCurrentUserEntry(null);
      setLoading(false);
      return;
    }

    const userIds = profiles.map(p => p.user_id);

    // Fetch load test predictions
    const { data: predictions, error: predictionsError } = await supabase
      .from('load_test_predictions')
      .select('user_id, match_id, home_score, away_score')
      .eq('tenant_id', LOAD_TEST_TENANT_ID);

    if (predictionsError) {
      // Error handled silently
    }

    // Fetch finished matches for scoring
    const { data: finishedMatches } = await supabase
      .from('live_matches')
      .select('match_id, home_score, away_score, status')
      .in('status', ['FINISHED', 'FT', 'AET', 'PEN']);

    // Build match results map
    const matchResults = new Map<string, { home_score: number | null; away_score: number | null }>();
    finishedMatches?.forEach(match => {
      matchResults.set(match.match_id, { home_score: match.home_score, away_score: match.away_score });
    });
    groupStageMatches
      .filter(m => m.status === 'finished' && m.homeScore !== undefined && m.awayScore !== undefined)
      .forEach(match => {
        matchResults.set(match.id, { home_score: match.homeScore ?? null, away_score: match.awayScore ?? null });
      });

    // Initialize user stats
    const userStats: Record<string, { points: number; predictions: number }> = {};
    userIds.forEach(userId => {
      userStats[userId] = { points: 0, predictions: 0 };
    });

    // Calculate match prediction points
    predictions?.forEach(p => {
      if (!userStats[p.user_id]) {
        userStats[p.user_id] = { points: 0, predictions: 0 };
      }
      userStats[p.user_id].predictions++;
      const match = matchResults.get(p.match_id);
      if (match && match.home_score !== null && match.away_score !== null) {
        const { points } = calculatePredictionPoints(p.home_score, p.away_score, match.home_score, match.away_score);
        userStats[p.user_id].points += points;
      }
    });

    // Build and sort leaderboard
    const allEntriesData: LeaderboardEntry[] = profiles.map(profile => ({
      rank: 0,
      userId: profile.user_id,
      displayName: profile.display_name,
      avatarEmoji: profile.avatar_emoji || '👤',
      totalPredictions: userStats[profile.user_id]?.predictions || 0,
      points: userStats[profile.user_id]?.points || 0,
    }));

    allEntriesData.sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points;
      return b.totalPredictions - a.totalPredictions;
    });

    allEntriesData.forEach((entry, index) => {
      entry.rank = index + 1;
    });

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
