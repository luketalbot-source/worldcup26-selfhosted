import { useEffect, useState, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { calculatePredictionPoints } from '@/lib/scoringCalculator';
import { groupStageMatches } from '@/data/matches';

interface LeaderboardEntry {
  rank: number;
  userId: string;
  displayName: string;
  avatarEmoji: string;
  totalPredictions: number;
  points: number;
}

// Cache for leaderboard data
const leaderboardCache = new Map<string, { data: LeaderboardEntry[]; timestamp: number }>();
const CACHE_TTL = 30000; // 30 seconds

export const useLeaderboard = (tenantId: string | null) => {
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const fetchingRef = useRef(false);

  const fetchLeaderboard = useCallback(async () => {
    if (!tenantId || fetchingRef.current) return;

    // Check cache first
    const cached = leaderboardCache.get(tenantId);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      setLeaderboard(cached.data);
      setLoading(false);
      return;
    }

    fetchingRef.current = true;
    setLoading(true);

    try {
      // Parallelize first batch of queries
      const [
        profilesRes,
        finishedMatchesRes,
        awardsRes,
        resultsRes,
        customAwardsRes,
        customResultsRes,
      ] = await Promise.all([
        supabase.rpc('get_tenant_profiles', { _tenant_id: tenantId }),
        supabase.from('live_matches').select('match_id, home_score, away_score, status').in('status', ['FINISHED', 'FT', 'AET', 'PEN']),
        supabase.from('boost_awards').select('id, prediction_type, points_value'),
        supabase.from('boost_results').select('award_id, result_team_code, result_player_name'),
        supabase.from('tenant_custom_boosts').select('id, prediction_type, points_value').eq('tenant_id', tenantId),
        supabase.from('tenant_custom_boost_results').select('custom_boost_id, result_team_code, result_player_name'),
      ]);

      if (profilesRes.error || !profilesRes.data?.length) {
        setLeaderboard([]);
        leaderboardCache.set(tenantId, { data: [], timestamp: Date.now() });
        return;
      }

      const userIds = profilesRes.data.map(p => p.user_id);

      // Second batch: queries depending on user IDs
      const [predictionsRes, boostPredictionsRes, customBoostPredictionsRes] = await Promise.all([
        supabase.from('predictions').select('user_id, match_id, home_score, away_score').in('user_id', userIds),
        supabase.from('boost_predictions').select('user_id, award_id, predicted_team_code, predicted_player_name').in('user_id', userIds),
        supabase.from('tenant_custom_boost_predictions').select('user_id, custom_boost_id, predicted_team_code, predicted_player_name').in('user_id', userIds),
      ]);

      // Create match results map
      const matchResults = new Map<string, { home_score: number | null; away_score: number | null }>();
      finishedMatchesRes.data?.forEach(match => {
        matchResults.set(match.match_id, { home_score: match.home_score, away_score: match.away_score });
      });
      groupStageMatches
        .filter(m => m.status === 'finished' && m.homeScore !== undefined && m.awayScore !== undefined)
        .forEach(match => {
          matchResults.set(match.id, { home_score: match.homeScore ?? null, away_score: match.awayScore ?? null });
        });

      // Initialize and calculate stats
      const userStats: Record<string, { points: number; predictions: number }> = {};
      userIds.forEach(userId => { userStats[userId] = { points: 0, predictions: 0 }; });

      predictionsRes.data?.forEach(p => {
        if (!userStats[p.user_id]) userStats[p.user_id] = { points: 0, predictions: 0 };
        userStats[p.user_id].predictions++;
        const match = matchResults.get(p.match_id);
        if (match && match.home_score !== null && match.away_score !== null) {
          const { points } = calculatePredictionPoints(p.home_score, p.away_score, match.home_score, match.away_score);
          userStats[p.user_id].points += points;
        }
      });

      const awards = awardsRes.data || [];
      const results = resultsRes.data || [];
      boostPredictionsRes.data?.forEach(p => {
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

      const customAwards = customAwardsRes.data || [];
      const customResults = customResultsRes.data || [];
      const existingCustomBoostIds = new Set(customAwards.map(a => a.id));
      customBoostPredictionsRes.data?.forEach(p => {
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
      const entries: LeaderboardEntry[] = profilesRes.data.map(profile => ({
        rank: 0,
        userId: profile.user_id,
        displayName: profile.display_name,
        avatarEmoji: profile.avatar_emoji || '👤',
        totalPredictions: userStats[profile.user_id]?.predictions || 0,
        points: userStats[profile.user_id]?.points || 0,
      }));

      entries.sort((a, b) => b.points !== a.points ? b.points - a.points : b.totalPredictions - a.totalPredictions);
      entries.forEach((entry, index) => { entry.rank = index + 1; });

      setLeaderboard(entries);
      leaderboardCache.set(tenantId, { data: entries, timestamp: Date.now() });
    } finally {
      setLoading(false);
      fetchingRef.current = false;
    }
  }, [tenantId]);

  useEffect(() => {
    if (tenantId) {
      const cached = leaderboardCache.get(tenantId);
      if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
        setLeaderboard(cached.data);
        setLoading(false);
      } else {
        fetchLeaderboard();
      }
    }
  }, [tenantId, fetchLeaderboard]);

  const invalidateCache = useCallback(() => {
    if (tenantId) {
      leaderboardCache.delete(tenantId);
    }
  }, [tenantId]);

  const refetch = useCallback(() => {
    invalidateCache();
    fetchLeaderboard();
  }, [invalidateCache, fetchLeaderboard]);

  return { leaderboard, loading, refetch };
};
