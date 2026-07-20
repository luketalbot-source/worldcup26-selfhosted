import { useEffect, useRef, useState } from 'react';
import { cachedGet } from '@/lib/requestCache';
import { boostResultIncludes } from '@/lib/boostMatch';
import { calculateUserStats, UserStats } from '@/lib/scoringCalculator';
import { groupStageMatches } from '@/data/matches';
import { useLiveMatchesContext } from '@/contexts/LiveMatchesContext';

interface ApiPrediction {
  match_id: string;
  home_score: number;
  away_score: number;
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

// These endpoints are also fetched by usePredictions / useBoostAwards /
// useCustomBoostAwards when their views mount; the shared cache means a
// Profile visit reuses those responses instead of re-hitting all of them.
const STATS_TTL_MS = 30_000;

export const useUserStats = (userId: string | undefined, tenantId?: string | null) => {
  const [stats, setStats] = useState<UserStats>(defaultStats);
  const [loading, setLoading] = useState(true);

  // Matches come from LiveMatchesContext (already fetched once per tab and
  // kept fresh over SSE) — no GET /matches of our own. Read through a ref
  // so SSE updates don't re-trigger the fetch effect below.
  const { matches, loading: matchesLoading } = useLiveMatchesContext();
  const matchesRef = useRef(matches);
  matchesRef.current = matches;

  useEffect(() => {
    if (matchesLoading) return; // wait for the context's initial load
    if (userId) {
      fetchStats(userId);
    } else {
      setStats(defaultStats);
      setLoading(false);
    }
  }, [userId, tenantId, matchesLoading]);

  const fetchStats = async (uid: string, force = false) => {
    setLoading(true);

    const tenantParam: Record<string, string | undefined> = tenantId
      ? { tenant_id: tenantId }
      : {};

    const finishedMatches = matchesRef.current.filter((m) =>
      ['FINISHED', 'FT', 'AET', 'PEN'].includes(m.status)
    );

    let predictions: ApiPrediction[] = [];
    let awards: ApiBoostAward[] = [];
    let boostPredictions: ApiBoostPrediction[] = [];
    let boostResults: ApiBoostResult[] = [];
    let customAwards: ApiCustomBoostAward[] = [];
    let customPredictions: ApiCustomBoostPrediction[] = [];
    let customResults: ApiCustomBoostResult[] = [];

    try {
      const [
        predictionsResp,
        awardsResp,
        boostPredictionsResp,
        boostResultsResp,
        customAwardsResp,
        customPredictionsResp,
        customResultsResp,
      ] = await Promise.all([
        cachedGet<ApiPrediction[]>('/predictions', { params: tenantParam, ttlMs: STATS_TTL_MS, force }),
        cachedGet<ApiBoostAward[]>('/boosts/awards', { ttlMs: STATS_TTL_MS, force }),
        cachedGet<ApiBoostPrediction[]>('/boosts/predictions', { params: tenantParam, ttlMs: STATS_TTL_MS, force }),
        cachedGet<ApiBoostResult[]>('/boosts/results', { ttlMs: STATS_TTL_MS, force }),
        cachedGet<ApiCustomBoostAward[]>('/custom-boosts', { params: tenantParam, ttlMs: STATS_TTL_MS, force }),
        cachedGet<ApiCustomBoostPrediction[]>('/custom-boosts/predictions', { params: tenantParam, ttlMs: STATS_TTL_MS, force }),
        cachedGet<ApiCustomBoostResult[]>('/custom-boosts/results', { params: tenantParam, ttlMs: STATS_TTL_MS, force }),
      ]);

      predictions = predictionsResp ?? [];
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
          if (boostResultIncludes(result.result_team_code, prediction.predicted_team_code)) {
            boostPoints += award.points_value;
          }
        } else if (boostResultIncludes(result.result_player_name, prediction.predicted_player_name)) {
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
          if (boostResultIncludes(result.result_team_code, prediction.predicted_team_code)) {
            boostPoints += award.points_value;
          }
        } else if (boostResultIncludes(result.result_player_name, prediction.predicted_player_name)) {
          boostPoints += award.points_value;
        }
      }
    }

    // Calculate total predictions count (match + boost + custom boost)
    const totalPredictionCount = predictions.length + boostPredictionCount + customBoostPredictionCount;

    // Create a map of finished matches
    const matchResults = new Map<string, { home_score: number | null; away_score: number | null }>();

    // Add matches from the live-matches context
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
      fetchStats(userId, true);
    }
  };

  return { stats, loading, refetch };
};
