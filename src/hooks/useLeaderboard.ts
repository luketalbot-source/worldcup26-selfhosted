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

export const useLeaderboard = () => {
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchLeaderboard();
  }, []);

  const fetchLeaderboard = async () => {
    setLoading(true);
    
    // Get all predictions with scores
    const { data: predictions, error: predictionsError } = await supabase
      .from('predictions')
      .select('user_id, match_id, home_score, away_score');

    if (predictionsError) {
      setLoading(false);
      return;
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

    // Calculate points and prediction counts per user
    const userStats: Record<string, { points: number; predictions: number }> = {};
    
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

    // Get profiles for users with predictions
    const userIds = Object.keys(userStats);
    if (userIds.length === 0) {
      setLeaderboard([]);
      setLoading(false);
      return;
    }

    const { data: profiles, error: profilesError } = await supabase
      .from('profiles')
      .select('*')
      .in('user_id', userIds);

    if (profilesError) {
      setLoading(false);
      return;
    }

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
