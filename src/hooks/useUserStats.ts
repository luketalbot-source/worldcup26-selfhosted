import { useEffect, useState } from 'react';
import { api } from '@/lib/apiClient';
import { calculateUserStats, UserStats } from '@/lib/scoringCalculator';
import { groupStageMatches } from '@/data/matches';
import { useTenant } from '@/contexts/TenantContext';

interface ApiPrediction {
  match_id: string;
  home_score: number;
  away_score: number;
}

interface ApiLiveMatch {
  match_id: string;
  home_score: number | null;
  away_score: number | null;
  status: string;
}

interface ApiBoostAward {
  id: string;
  prediction_type: string;
  points_value: number;
}

interface ApiBoostPrediction {
  award_id: string;
  predicted_team_code: string | null;
  predicted_player_name: string | null;
}

interface ApiBoostResult {
  award_id: string;
  result_team_code: string | null;
  result_player_name: string | null;
}

interface ApiCustomBoostAward {
  id: string;
  prediction_type: string;
  points_value: number;
}

interface ApiCustomBoostPrediction {
  custom_boost_id: string;
  predicted_team_code: string | null;
  predicted_player_name: string | null;
}

interface ApiCustomBoostResult {
  custom_boost_id: string;
  result_team_code: string | null;
  result_player_name: string | null;
}

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

    const tenantParam: Record<string, string | undefined> = tenantId
      ? { tenant_id: tenantId }
      : {};

    // Fetch all data in parallel
    const [
      predictionsRes,
      matchesRes,
      awardsRes,
      boostPredictionsRes,
      boostResultsRes,
      customAwardsRes,
      customPredictionsRes,
      customResultsRes,
    ] = await Promise.all([
      api.get<ApiPrediction[]>('/predictions', tenantParam),
      api.get<ApiLiveMatch[]>('/matches'),
      api.get<ApiBoostAward[]>('/boosts/awards'),
      api.get<ApiBoostPrediction[]>('/boosts/predictions', tenantParam),
      api.get<ApiBoostResult[]>('/boosts/results'),
      api.get<ApiCustomBoostAward[]>('/custom-boosts', tenantParam),
      api.get<ApiCustomBoostPrediction[]>('/custom-boosts/predictions', tenantParam),
      api.get<ApiCustomBoostResult[]>('/custom-boosts/results', tenantParam),
    ]);

    if (predictionsRes.error) {
      console.error('Error fetching predictions:', predictionsRes.error);
      setLoading(false);
      return;
    }

    if (matchesRes.error) {
      console.error('Error fetching matches:', matchesRes.error);
      setLoading(false);
      return;
    }

    const predictions = predictionsRes.data || [];
    const finishedMatches = (matchesRes.data || []).filter(m =>
      ['FINISHED', 'FT', 'AET', 'PEN'].includes(m.status)
    );

    // Calculate boost points and prediction counts
    let boostPredictionCount = boostPredictionsRes.data?.length || 0;
    let boostPoints = 0;
    if (awardsRes.data && boostPredictionsRes.data && boostResultsRes.data) {
      const awards = awardsRes.data;
      const boostPredictions = boostPredictionsRes.data;
      const results = boostResultsRes.data;

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
    const totalPredictionCount = predictions.length + boostPredictionCount + customBoostPredictionCount;

    // Create a map of finished matches
    const matchResults = new Map<string, { home_score: number | null; away_score: number | null }>();

    // Add matches from API
    finishedMatches.forEach(match => {
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
    const calculatedStats = calculateUserStats(predictions, matchResults, boostPoints, totalPredictionCount);
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
