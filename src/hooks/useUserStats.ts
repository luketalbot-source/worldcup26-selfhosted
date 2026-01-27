import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { calculateUserStats, UserStats } from '@/lib/scoringCalculator';

const defaultStats: UserStats = {
  totalPoints: 0,
  exactScores: 0,
  correctResults: 0,
  wrongResults: 0,
  totalPredictions: 0,
  accuracy: 0,
};

export const useUserStats = (userId: string | undefined) => {
  const [stats, setStats] = useState<UserStats>(defaultStats);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (userId) {
      fetchStats(userId);
    } else {
      setStats(defaultStats);
      setLoading(false);
    }
  }, [userId]);

  const fetchStats = async (uid: string) => {
    setLoading(true);

    // Get user's predictions
    const { data: predictions, error: predictionsError } = await supabase
      .from('predictions')
      .select('match_id, home_score, away_score')
      .eq('user_id', uid);

    if (predictionsError) {
      console.error('Error fetching predictions:', predictionsError);
      setLoading(false);
      return;
    }

    // Get all finished matches
    const { data: finishedMatches, error: matchesError } = await supabase
      .from('live_matches')
      .select('match_id, home_score, away_score, status')
      .in('status', ['FINISHED', 'FT', 'AET', 'PEN']);

    if (matchesError) {
      console.error('Error fetching matches:', matchesError);
      setLoading(false);
      return;
    }

    // Create a map of finished matches
    const matchResults = new Map<string, { home_score: number | null; away_score: number | null }>();
    finishedMatches?.forEach(match => {
      matchResults.set(match.match_id, {
        home_score: match.home_score,
        away_score: match.away_score,
      });
    });

    // Calculate stats
    const calculatedStats = calculateUserStats(predictions || [], matchResults);
    setStats(calculatedStats);
    setLoading(false);
  };

  const refetch = () => {
    if (userId) {
      fetchStats(userId);
    }
  };

  return { stats, loading, refetch };
};
