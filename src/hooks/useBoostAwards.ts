import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useTenant } from '@/contexts/TenantContext';

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
  const [awards, setAwards] = useState<BoostAward[]>([]);
  const [predictions, setPredictions] = useState<BoostPrediction[]>([]);
  const [results, setResults] = useState<BoostResult[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    setLoading(true);
    try {
      // Fetch awards
      const { data: awardsData, error: awardsError } = await supabase
        .from('boost_awards')
        .select('*')
        .order('display_order');

      if (awardsError) throw awardsError;
      setAwards((awardsData || []) as BoostAward[]);

      // Fetch user predictions if logged in - filter by tenant
      if (user) {
        let predictionsQuery = supabase
          .from('boost_predictions')
          .select('*')
          .eq('user_id', user.id);
        
        if (tenantId) {
          predictionsQuery = predictionsQuery.eq('tenant_id', tenantId);
        }
        
        const { data: predictionsData, error: predictionsError } = await predictionsQuery;

        if (predictionsError) throw predictionsError;
        setPredictions(predictionsData || []);
      }

      // Fetch results
      const { data: resultsData, error: resultsError } = await supabase
        .from('boost_results')
        .select('*');

      if (resultsError) throw resultsError;
      setResults(resultsData || []);
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
      const { error } = await supabase
        .from('boost_predictions')
        .upsert({
          user_id: user.id,
          tenant_id: tenantId,
          award_id: awardId,
          predicted_team_code: teamCode,
          predicted_player_name: playerName,
        }, {
          onConflict: 'user_id,award_id',
        });

      if (error) throw error;

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

  const isLocked = (award: BoostAward): boolean => {
    if (!award.lock_date) return false;
    return new Date() >= new Date(award.lock_date);
  };

  const calculatePoints = (awardId: string): number => {
    const prediction = getPrediction(awardId);
    const result = getResult(awardId);
    const award = awards.find(a => a.id === awardId);
    
    if (!prediction || !result || !award) return 0;

    if (award.prediction_type === 'team') {
      if (prediction.predicted_team_code === result.result_team_code) {
        return award.points_value;
      }
    } else {
      if (prediction.predicted_player_name === result.result_player_name) {
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
