import { useEffect, useState, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { calculatePredictionPoints } from '@/lib/scoringCalculator';
import { groupStageMatches } from '@/data/matches';

interface LeagueLeaderboardEntry {
  rank: number;
  userId: string;
  displayName: string;
  avatarEmoji: string;
  totalPredictions: number;
  points: number;
  isCreator: boolean;
}

interface CacheEntry {
  data: LeagueLeaderboardEntry[];
  timestamp: number;
}

// Client-side TTL cache for league leaderboards (30 seconds)
const leaderboardCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 30 * 1000;

export const useLeagueLeaderboard = (leagueId: string | null, creatorId: string | null) => {
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

    // Get league members
    const { data: members, error: membersError } = await supabase
      .from('league_members')
      .select('user_id')
      .eq('league_id', leagueId);

    if (membersError || !members?.length) {
      setLeaderboard([]);
      setLoading(false);
      return;
    }

    const memberIds = members.map(m => m.user_id);

    // Get predictions for these members
    const { data: predictions, error: predictionsError } = await supabase
      .from('predictions')
      .select('user_id, match_id, home_score, away_score')
      .in('user_id', memberIds);

    if (predictionsError) {
      console.error('Error fetching predictions:', predictionsError);
    }

    // Get boost predictions for these members (with details for scoring)
    const { data: boostPredictions, error: boostError } = await supabase
      .from('boost_predictions')
      .select('user_id, award_id, predicted_team_code, predicted_player_name')
      .in('user_id', memberIds);

    if (boostError) {
      console.error('Error fetching boost predictions:', boostError);
    }

    // Get custom boost predictions for these members
    const { data: customBoostPredictions, error: customBoostError } = await supabase
      .from('tenant_custom_boost_predictions')
      .select('user_id, custom_boost_id, predicted_team_code, predicted_player_name')
      .in('user_id', memberIds);

    if (customBoostError) {
      console.error('Error fetching custom boost predictions:', customBoostError);
    }

    // Get all finished matches from live_matches (database)
    const { data: finishedMatches, error: matchesError } = await supabase
      .from('live_matches')
      .select('match_id, home_score, away_score, status')
      .in('status', ['FINISHED', 'FT', 'AET', 'PEN']);

    if (matchesError) {
      console.error('Error fetching matches:', matchesError);
    }

    // Get boost awards and results for scoring
    const [awardsRes, resultsRes, customAwardsRes, customResultsRes] = await Promise.all([
      supabase.from('boost_awards').select('id, prediction_type, points_value'),
      supabase.from('boost_results').select('award_id, result_team_code, result_player_name'),
      supabase.from('tenant_custom_boosts').select('id, prediction_type, points_value'),
      supabase.from('tenant_custom_boost_results').select('custom_boost_id, result_team_code, result_player_name'),
    ]);

    // Create a map of finished matches for quick lookup
    const matchResults = new Map<string, { home_score: number | null; away_score: number | null }>();
    
    // Add matches from database
    finishedMatches?.forEach(match => {
      matchResults.set(match.match_id, {
        home_score: match.home_score,
        away_score: match.away_score,
      });
    });
    
    // Also add finished matches from static data (for test matches)
    groupStageMatches
      .filter(m => m.status === 'finished' && m.homeScore !== undefined && m.awayScore !== undefined)
      .forEach(match => {
        matchResults.set(match.id, {
          home_score: match.homeScore ?? null,
          away_score: match.awayScore ?? null,
        });
      });

    // Calculate points and prediction counts per user
    const userStats: Record<string, { points: number; predictions: number }> = {};
    
    // Initialize all members with 0 stats
    memberIds.forEach(userId => {
      userStats[userId] = { points: 0, predictions: 0 };
    });
    
    predictions?.forEach(p => {
      if (!userStats[p.user_id]) {
        userStats[p.user_id] = { points: 0, predictions: 0 };
      }
      
      userStats[p.user_id].predictions++;
      
      // Calculate points if match is finished
      const match = matchResults.get(p.match_id);
      if (match && match.home_score !== null && match.away_score !== null) {
        const { points } = calculatePredictionPoints(
          p.home_score,
          p.away_score,
          match.home_score,
          match.away_score
        );
        userStats[p.user_id].points += points;
      }
    });

    // Add boost predictions to the count and calculate points
    const awards = awardsRes.data || [];
    const results = resultsRes.data || [];
    
    boostPredictions?.forEach(p => {
      if (userStats[p.user_id]) {
        userStats[p.user_id].predictions++;
        
        // Calculate boost points if result exists
        const result = results.find(r => r.award_id === p.award_id);
        const award = awards.find(a => a.id === p.award_id);
        
        if (result && award) {
          if (award.prediction_type === 'team') {
            if (p.predicted_team_code === result.result_team_code) {
              userStats[p.user_id].points += award.points_value;
            }
          } else {
            if (p.predicted_player_name === result.result_player_name) {
              userStats[p.user_id].points += award.points_value;
            }
          }
        }
      }
    });

    // Add custom boost predictions to the count and calculate points
    // Only count predictions for boosts that still exist (not deleted)
    const customAwards = customAwardsRes.data || [];
    const customResults = customResultsRes.data || [];
    const existingCustomBoostIds = new Set(customAwards.map(a => a.id));
    
    customBoostPredictions?.forEach(p => {
      // Only count predictions for boosts that still exist
      if (!existingCustomBoostIds.has(p.custom_boost_id)) {
        return;
      }
      
      if (userStats[p.user_id]) {
        userStats[p.user_id].predictions++;
        
        // Calculate custom boost points if result exists
        const result = customResults.find(r => r.custom_boost_id === p.custom_boost_id);
        const award = customAwards.find(a => a.id === p.custom_boost_id);
        
        if (result && award) {
          if (award.prediction_type === 'team') {
            if (p.predicted_team_code === result.result_team_code) {
              userStats[p.user_id].points += award.points_value;
            }
          } else {
            if (p.predicted_player_name === result.result_player_name) {
              userStats[p.user_id].points += award.points_value;
            }
          }
        }
      }
    });

    // Get profiles for league members using secure view (excludes phone numbers)
    const { data: profiles, error: profilesError } = await supabase
      .from('profiles_public')
      .select('*')
      .in('user_id', memberIds);

    if (profilesError) {
      setLoading(false);
      fetchingRef.current = false;
      return;
    }

    // Build leaderboard with actual points
    const entries: LeagueLeaderboardEntry[] = (profiles || []).map(profile => ({
      rank: 0,
      userId: profile.user_id,
      displayName: profile.display_name,
      avatarEmoji: profile.avatar_emoji || '👤',
      totalPredictions: userStats[profile.user_id]?.predictions || 0,
      points: userStats[profile.user_id]?.points || 0,
      isCreator: profile.user_id === creatorId,
    }));

    // Sort by points (descending), then by predictions count as tiebreaker
    entries.sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points;
      return b.totalPredictions - a.totalPredictions;
    });
    
    entries.forEach((entry, index) => {
      entry.rank = index + 1;
    });

    // Store in cache
    leaderboardCache.set(leagueId, {
      data: entries,
      timestamp: Date.now(),
    });

    setLeaderboard(entries);
    setLoading(false);
    fetchingRef.current = false;
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
