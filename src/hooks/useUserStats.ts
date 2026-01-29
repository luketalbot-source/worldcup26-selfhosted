import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { calculateUserStats, UserStats } from '@/lib/scoringCalculator';
import { groupStageMatches } from '@/data/matches';
import { useTenant } from '@/contexts/TenantContext';

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

export const useUserStats = (userId: string | undefined, tenantId?: string | null) => {
  const [stats, setStats] = useState<UserStats>(defaultStats);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (userId) {
      fetchStats(userId);
    } else {
      setStats(defaultStats);
      setLoading(false);
    }
  }, [userId, tenantId]);

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
    // For custom boosts, only count those that still exist in the tenant
    const customBoostsQuery = tenantId 
      ? supabase.from('tenant_custom_boosts').select('id, prediction_type, points_value').eq('tenant_id', tenantId)
      : supabase.from('tenant_custom_boosts').select('id, prediction_type, points_value');
    
    const [awardsRes, boostPredictionsRes, resultsRes, customAwardsRes, customPredictionsRes, customResultsRes] = await Promise.all([
      supabase.from('boost_awards').select('id, prediction_type, points_value'),
      supabase.from('boost_predictions').select('award_id, predicted_team_code, predicted_player_name').eq('user_id', uid),
      supabase.from('boost_results').select('award_id, result_team_code, result_player_name'),
      customBoostsQuery,
      supabase.from('tenant_custom_boost_predictions').select('custom_boost_id, predicted_team_code, predicted_player_name').eq('user_id', uid),
      supabase.from('tenant_custom_boost_results').select('custom_boost_id, result_team_code, result_player_name'),
    ]);

    // Calculate boost points and prediction counts
    let boostPredictionCount = boostPredictionsRes.data?.length || 0;
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

    // Calculate custom boost points - only count predictions for boosts that still exist
    let customBoostPredictionCount = 0;
    if (customAwardsRes.data && customPredictionsRes.data && customResultsRes.data) {
      const customAwards = customAwardsRes.data;
      const customPredictions = customPredictionsRes.data;
      const customResults = customResultsRes.data;

      // Create a set of existing custom boost IDs
      const existingBoostIds = new Set(customAwards.map(a => a.id));

      for (const prediction of customPredictions) {
        // Only count predictions for boosts that still exist (not deleted)
        if (!existingBoostIds.has(prediction.custom_boost_id)) {
          continue;
        }
        
        customBoostPredictionCount++;
        
        const result = customResults.find(r => r.custom_boost_id === prediction.custom_boost_id);
        const award = customAwards.find(a => a.id === prediction.custom_boost_id);
        
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

    // Calculate total predictions count (match + boost + custom boost)
    const totalPredictionCount = (predictions?.length || 0) + boostPredictionCount + customBoostPredictionCount;

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

    // Calculate stats with boost points and total predictions
    const calculatedStats = calculateUserStats(predictions || [], matchResults, boostPoints, totalPredictionCount);
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
