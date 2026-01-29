import { useEffect, useState } from 'react';
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

export const useLeaderboard = (tenantId: string | null) => {
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
    
    // Get ALL profiles in the current tenant only using secure function (excludes phone numbers)
    const { data: profiles, error: profilesError } = await supabase
      .rpc('get_tenant_profiles', { _tenant_id: tenantId });

    if (profilesError) {
      console.error('Error fetching profiles:', profilesError);
      setLoading(false);
      return;
    }

    if (!profiles || profiles.length === 0) {
      setLeaderboard([]);
      setLoading(false);
      return;
    }

    const userIds = profiles.map(p => p.user_id);

    // Get all predictions with scores for these users
    const { data: predictions, error: predictionsError } = await supabase
      .from('predictions')
      .select('user_id, match_id, home_score, away_score')
      .in('user_id', userIds);

    if (predictionsError) {
      console.error('Error fetching predictions:', predictionsError);
    }

    // Get boost predictions for these users
    const { data: boostPredictions, error: boostError } = await supabase
      .from('boost_predictions')
      .select('user_id')
      .in('user_id', userIds);

    if (boostError) {
      console.error('Error fetching boost predictions:', boostError);
    }

    // Get all finished matches from live_matches (database)
    const { data: finishedMatches, error: matchesError } = await supabase
      .from('live_matches')
      .select('match_id, home_score, away_score, status')
      .in('status', ['FINISHED', 'FT', 'AET', 'PEN']);

    if (matchesError) {
      console.error('Error fetching matches:', matchesError);
    }

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

    // Initialize all users with 0 stats
    const userStats: Record<string, { points: number; predictions: number }> = {};
    userIds.forEach(userId => {
      userStats[userId] = { points: 0, predictions: 0 };
    });

    // Calculate points and prediction counts per user
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

    // Add boost predictions to the count
    boostPredictions?.forEach(p => {
      if (userStats[p.user_id]) {
        userStats[p.user_id].predictions++;
      }
    });

    // Build leaderboard with actual points
    const entries: LeaderboardEntry[] = (profiles || []).map(profile => ({
      rank: 0,
      userId: profile.user_id,
      displayName: profile.display_name,
      avatarEmoji: profile.avatar_emoji || '👤',
      totalPredictions: userStats[profile.user_id]?.predictions || 0,
      points: userStats[profile.user_id]?.points || 0,
    }));

    // Sort by points (descending), then by predictions count as tiebreaker
    entries.sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points;
      return b.totalPredictions - a.totalPredictions;
    });
    
    entries.forEach((entry, index) => {
      entry.rank = index + 1;
    });

    setLeaderboard(entries);
    setLoading(false);
  };

  return { leaderboard, loading, refetch: fetchLeaderboard };
};
