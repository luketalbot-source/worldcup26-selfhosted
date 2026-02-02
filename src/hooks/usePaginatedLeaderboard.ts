import { useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { calculatePredictionPoints } from '@/lib/scoringCalculator';
import { groupStageMatches } from '@/data/matches';
import type { AuthMethod } from '@/contexts/TenantContext';

export interface LeaderboardEntry {
  rank: number;
  userId: string;
  displayName: string;
  avatarEmoji: string;
  totalPredictions: number;
  points: number;
}

interface UsePaginatedLeaderboardOptions {
  tenantId: string | null;
  authMethod?: AuthMethod;
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
  authMethod,
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

    // Fetch profiles based on auth method
    let profiles: { id: string; user_id: string; display_name: string; avatar_emoji: string }[] | null = null;
    let profilesError: Error | null = null;

    if (authMethod === 'oidc') {
      const result = await supabase.rpc('get_oidc_tenant_profiles', { _tenant_id: tenantId });
      profiles = result.data;
      profilesError = result.error;
    } else {
      const result = await supabase.rpc('get_tenant_profiles', { _tenant_id: tenantId });
      profiles = result.data;
      profilesError = result.error;
    }

    if (profilesError) {
      console.error('Error fetching profiles:', profilesError);
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

    // Fetch all data in parallel
    const [predictionsRes, boostPredictionsRes, customBoostPredictionsRes, awardsRes, resultsRes, customAwardsRes, customResultsRes, finishedMatchesRes] = await Promise.all([
      supabase
        .from('predictions')
        .select('user_id, match_id, home_score, away_score')
        .in('user_id', userIds)
        .eq('tenant_id', tenantId),
      supabase
        .from('boost_predictions')
        .select('user_id, award_id, predicted_team_code, predicted_player_name')
        .in('user_id', userIds)
        .eq('tenant_id', tenantId),
      supabase
        .from('tenant_custom_boost_predictions')
        .select('user_id, custom_boost_id, predicted_team_code, predicted_player_name')
        .in('user_id', userIds)
        .eq('tenant_id', tenantId),
      supabase.from('boost_awards').select('id, prediction_type, points_value'),
      supabase.from('boost_results').select('award_id, result_team_code, result_player_name'),
      supabase.from('tenant_custom_boosts').select('id, prediction_type, points_value').eq('tenant_id', tenantId),
      supabase.from('tenant_custom_boost_results').select('custom_boost_id, result_team_code, result_player_name'),
      supabase.from('live_matches').select('match_id, home_score, away_score, status').in('status', ['FINISHED', 'FT', 'AET', 'PEN']),
    ]);

    const predictions = predictionsRes.data;
    const boostPredictions = boostPredictionsRes.data;
    const customBoostPredictions = customBoostPredictionsRes.data;
    const finishedMatches = finishedMatchesRes.data;

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

    // Calculate boost points
    const awards = awardsRes.data || [];
    const results = resultsRes.data || [];
    boostPredictions?.forEach(p => {
      if (userStats[p.user_id]) {
        userStats[p.user_id].predictions++;
        const result = results.find(r => r.award_id === p.award_id);
        const award = awards.find(a => a.id === p.award_id);
        if (result && award) {
          if (award.prediction_type === 'team' && p.predicted_team_code === result.result_team_code) {
            userStats[p.user_id].points += award.points_value;
          } else if (award.prediction_type !== 'team' && p.predicted_player_name === result.result_player_name) {
            userStats[p.user_id].points += award.points_value;
          }
        }
      }
    });

    // Calculate custom boost points
    const customAwards = customAwardsRes.data || [];
    const customResults = customResultsRes.data || [];
    const existingCustomBoostIds = new Set(customAwards.map(a => a.id));
    customBoostPredictions?.forEach(p => {
      if (!existingCustomBoostIds.has(p.custom_boost_id)) return;
      if (userStats[p.user_id]) {
        userStats[p.user_id].predictions++;
        const result = customResults.find(r => r.custom_boost_id === p.custom_boost_id);
        const award = customAwards.find(a => a.id === p.custom_boost_id);
        if (result && award) {
          if (award.prediction_type === 'team' && p.predicted_team_code === result.result_team_code) {
            userStats[p.user_id].points += award.points_value;
          } else if (award.prediction_type !== 'team' && p.predicted_player_name === result.result_player_name) {
            userStats[p.user_id].points += award.points_value;
          }
        }
      }
    });

    // Build and sort leaderboard
    const allEntriesData: LeaderboardEntry[] = (profiles || []).map(profile => ({
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

    // Find current user entry
    if (currentUserId) {
      const userEntry = allEntriesData.find(e => e.userId === currentUserId);
      setCurrentUserEntry(userEntry || null);
    }

    setLoading(false);
  }, [tenantId, authMethod, pageSize, currentUserId]);

  useEffect(() => {
    if (tenantId && !fetchedRef.current) {
      fetchLeaderboard();
    }
  }, [tenantId, authMethod, fetchLeaderboard]);

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
