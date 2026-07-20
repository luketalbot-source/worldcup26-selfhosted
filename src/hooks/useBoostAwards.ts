import { useEffect, useState } from 'react';
import { api } from '@/lib/apiClient';
import { boostResultIncludes } from '@/lib/boostMatch';
import { useAuth } from '@/contexts/AuthContext';
import { useTenant } from '@/contexts/TenantContext';
import { useLiveMatchesContext } from '@/contexts/LiveMatchesContext';

export interface BoostAward {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  prediction_type: 'team' | 'player';
  points_value: number;
  lock_date: string | null;
  image_url: string | null;
  display_order: number;
}

export interface BoostPrediction {
  id: string;
  award_id: string;
  predicted_team_code: string | null;
  predicted_player_name: string | null;
}

export interface BoostResult {
  award_id: string;
  result_team_code: string | null;
  result_player_name: string | null;
}

export const useBoostAwards = () => {
  const { user } = useAuth();
  const { tenantId } = useTenant();
  // Global deadline lives on the LiveMatches context — the moment the first
  // knockout match kicks off, all boost predictions lock simultaneously.
  // Per-award lock_date columns are now ignored (the column stays in the DB
  // for back-compat with already-saved configs but no longer drives lock).
  const { boostsDeadline } = useLiveMatchesContext();
  const [awards, setAwards] = useState<BoostAward[]>([]);
  const [predictions, setPredictions] = useState<BoostPrediction[]>([]);
  const [results, setResults] = useState<BoostResult[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [awardsData, resultsData] = await Promise.all([
        api.get<BoostAward[]>('/boosts/awards'),
        api.get<BoostResult[]>('/boosts/results'),
      ]);
      setAwards(awardsData || []);
      setResults(resultsData || []);

      if (user) {
        const params: Record<string, string | undefined> = {};
        if (tenantId) params.tenant_id = tenantId;
        const predictionsData = await api.get<BoostPrediction[]>('/boosts/predictions', params);
        setPredictions(predictionsData || []);
      }
    } catch (err) {
      console.error('Error fetching boost data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [user, tenantId]);

  const savePrediction = async (awardId: string, teamCode: string | null, playerName: string | null) => {
    if (!user || !tenantId) return false;

    try {
      await api.post('/boosts/predictions', {
        award_id: awardId,
        tenant_id: tenantId,
        predicted_team_code: teamCode,
        predicted_player_name: playerName,
      });

      // Update local state
      const existing = predictions.find(p => p.award_id === awardId);
      if (existing) {
        setPredictions(predictions.map(p =>
          p.award_id === awardId
            ? { ...p, predicted_team_code: teamCode, predicted_player_name: playerName }
            : p
        ));
      } else {
        setPredictions([...predictions, {
          id: crypto.randomUUID(),
          award_id: awardId,
          predicted_team_code: teamCode,
          predicted_player_name: playerName,
        }]);
      }
      return true;
    } catch (err) {
      console.error('Error saving boost prediction:', err);
      return false;
    }
  };

  const getPrediction = (awardId: string): BoostPrediction | undefined => {
    return predictions.find(p => p.award_id === awardId);
  };

  const getResult = (awardId: string): BoostResult | undefined => {
    return results.find(r => r.award_id === awardId);
  };

  const isLocked = (_award: BoostAward): boolean => {
    // Deadline = kickoff of first KO match (computed in LiveMatchesContext).
    // While we don't yet know the deadline (matches still loading or no KO
    // fixture yet), boosts stay open — better to be permissive than to
    // freeze the predictor on first paint.
    if (!boostsDeadline) return false;
    return new Date() >= boostsDeadline;
  };

  const calculatePoints = (awardId: string): number => {
    const prediction = getPrediction(awardId);
    const result = getResult(awardId);
    const award = awards.find(a => a.id === awardId);

    if (!prediction || !result || !award) return 0;

    if (award.prediction_type === 'team') {
      if (boostResultIncludes(result.result_team_code, prediction.predicted_team_code)) {
        return award.points_value;
      }
    } else {
      if (boostResultIncludes(result.result_player_name, prediction.predicted_player_name)) {
        return award.points_value;
      }
    }
    return 0;
  };

  const getTotalPoints = (): number => {
    return awards.reduce((sum, award) => sum + calculatePoints(award.id), 0);
  };

  return {
    awards,
    predictions,
    results,
    loading,
    savePrediction,
    getPrediction,
    getResult,
    isLocked,
    calculatePoints,
    getTotalPoints,
    refetch: fetchData,
  };
};
