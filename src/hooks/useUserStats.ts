import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { calculateUserStats, UserStats } from '@/lib/scoringCalculator';
import { groupStageMatches } from '@/data/matches';

const defaultStats: UserStats = {
  totalPoints: 0,
  matchPoints: 0,
  boostPoints: 0,
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

    // Get all finished matches from database
    const { data: finishedMatches, error: matchesError } = await supabase
      .from('live_matches')
      .select('match_id, home_score, away_score, status')
      .in('status', ['FINISHED', 'FT', 'AET', 'PEN']);

    if (matchesError) {
      console.error('Error fetching matches:', matchesError);
      setLoading(false);
      return;
    }

    // Fetch boost awards, predictions, and results to calculate boost points
    const [awardsRes, boostPredictionsRes, resultsRes] = await Promise.all([
      supabase.from('boost_awards').select('id, prediction_type, points_value'),
      supabase.from('boost_predictions').select('award_id, predicted_team_code, predicted_player_name').eq('user_id', uid),
      supabase.from('boost_results').select('award_id, result_team_code, result_player_name'),
    ]);

    // Calculate boost points
    let boostPoints = 0;
    if (awardsRes.data && boostPredictionsRes.data && resultsRes.data) {
      const awards = awardsRes.data;
      const boostPredictions = boostPredictionsRes.data;
      const results = resultsRes.data;

      for (const prediction of boostPredictions) {
        const result = results.find(r => r.award_id === prediction.award_id);
        const award = awards.find(a => a.id === prediction.award_id);
        
        if (result && award) {
          if (award.prediction_type === 'team') {
            if (prediction.predicted_team_code === result.result_team_code) {
              boostPoints += award.points_value;
            }
          } else {
            if (prediction.predicted_player_name === result.result_player_name) {
              boostPoints += award.points_value;
            }
          }
        }
      }
    }

    // Create a map of finished matches
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

    // Calculate stats with boost points
    const calculatedStats = calculateUserStats(predictions || [], matchResults, boostPoints);
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
