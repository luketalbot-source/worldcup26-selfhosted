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

    // The apiClient now throws on error and returns T directly (no
    // {data, error} wrapper). This hook predates that refactor and was
    // reading .data on raw arrays — meaning predictions/awards always
    // came back as `undefined` and totalPredictions stuck at 0.
    let predictions: ApiPrediction[] = [];
    let finishedMatches: ApiLiveMatch[] = [];
    let awards: ApiBoostAward[] = [];
    let boostPredictions: ApiBoostPrediction[] = [];
    let boostResults: ApiBoostResult[] = [];
    let customAwards: ApiCustomBoostAward[] = [];
    let customPredictions: ApiCustomBoostPrediction[] = [];
    let customResults: ApiCustomBoostResult[] = [];

    try {
      const [
        predictionsResp,
        matchesResp,
        awardsResp,
        boostPredictionsResp,
        boostResultsResp,
        customAwardsResp,
        customPredictionsResp,
        customResultsResp,
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

      predictions = predictionsResp ?? [];
      finishedMatches = (matchesResp ?? []).filter((m) =>
        ['FINISHED', 'FT', 'AET', 'PEN'].includes(m.status)
      );
      awards = awardsResp ?? [];
      boostPredictions = boostPredictionsResp ?? [];
      boostResults = boostResultsResp ?? [];
      customAwards = customAwardsResp ?? [];
      customPredictions = customPredictionsResp ?? [];
      customResults = customResultsResp ?? [];
    } catch (err) {
      console.error('useUserStats: fetch failed:', err);
      setLoading(false);
      return;
    }

    // Boost points + prediction count
    const boostPredictionCount = boostPredictions.length;
    let boostPoints = 0;
    for (const prediction of boostPredictions) {
      const result = boostResults.find((r) => r.award_id === prediction.award_id);
      const award = awards.find((a) => a.id === prediction.award_id);
      if (result && award) {
        if (award.prediction_type === 'team') {
          if (prediction.predicted_team_code === result.result_team_code) {
            boostPoints += award.points_value;
          }
        } else if (prediction.predicted_player_name === result.result_player_name) {
          boostPoints += award.points_value;
        }
      }
    }

    // Custom boost points — only count predictions for boosts that still exist
    let customBoostPredictionCount = 0;
    const existingBoostIds = new Set(customAwards.map((a) => a.id));
    for (const prediction of customPredictions) {
      if (!existingBoostIds.has(prediction.custom_boost_id)) continue;
      customBoostPredictionCount++;
      const result = customResults.find((r) => r.custom_boost_id === prediction.custom_boost_id);
      const award = customAwards.find((a) => a.id === prediction.custom_boost_id);
      if (result && award) {
        if (award.prediction_type === 'team') {
          if (prediction.predicted_team_code === result.result_team_code) {
            boostPoints += award.points_value;
          }
        } else if (prediction.predicted_player_name === result.result_player_name) {
          boostPoints += award.points_value;
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
