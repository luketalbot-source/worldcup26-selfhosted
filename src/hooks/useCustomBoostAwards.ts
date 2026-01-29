import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useTenant } from '@/contexts/TenantContext';

export interface CustomBoostAward {
  id: string;
  title: string;
  description: string | null;
  prediction_type: 'team' | 'player';
  points_value: number;
  lock_date: string | null;
  image_url: string | null;
  display_order: number;
  original_language: string | null;
  isCustom: true; // Flag to identify as custom
}

export interface CustomBoostPrediction {
  id: string;
  custom_boost_id: string;
  predicted_team_code: string | null;
  predicted_player_name: string | null;
}

export interface CustomBoostResult {
  custom_boost_id: string;
  result_team_code: string | null;
  result_player_name: string | null;
}

export const useCustomBoostAwards = () => {
  const { user } = useAuth();
  const { tenantId } = useTenant();
  const [awards, setAwards] = useState<CustomBoostAward[]>([]);
  const [predictions, setPredictions] = useState<CustomBoostPrediction[]>([]);
  const [results, setResults] = useState<CustomBoostResult[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    if (!tenantId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      // Fetch custom awards for this tenant
      const { data: awardsData, error: awardsError } = await supabase
        .from('tenant_custom_boosts')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('display_order');

      if (awardsError) throw awardsError;
      
      const customAwards: CustomBoostAward[] = (awardsData || []).map(award => ({
        id: award.id,
        title: award.title,
        description: award.description,
        prediction_type: award.prediction_type as 'team' | 'player',
        points_value: award.points_value,
        lock_date: award.lock_date,
        image_url: award.image_url,
        display_order: award.display_order,
        original_language: award.original_language,
        isCustom: true,
      }));
      
      setAwards(customAwards);

      if (customAwards.length === 0) {
        setLoading(false);
        return;
      }

      const awardIds = customAwards.map(a => a.id);

      // Fetch user predictions if logged in
      if (user) {
        const { data: predictionsData, error: predictionsError } = await supabase
          .from('tenant_custom_boost_predictions')
          .select('*')
          .eq('user_id', user.id)
          .in('custom_boost_id', awardIds);

        if (predictionsError) throw predictionsError;
        setPredictions(predictionsData || []);
      }

      // Fetch results
      const { data: resultsData, error: resultsError } = await supabase
        .from('tenant_custom_boost_results')
        .select('*')
        .in('custom_boost_id', awardIds);

      if (resultsError) throw resultsError;
      setResults(resultsData || []);
    } catch (err) {
      console.error('Error fetching custom boost data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [user, tenantId]);

  const savePrediction = async (customBoostId: string, teamCode: string | null, playerName: string | null) => {
    if (!user || !tenantId) return false;

    try {
      const { error } = await supabase
        .from('tenant_custom_boost_predictions')
        .upsert({
          user_id: user.id,
          tenant_id: tenantId,
          custom_boost_id: customBoostId,
          predicted_team_code: teamCode,
          predicted_player_name: playerName,
        }, {
          onConflict: 'user_id,custom_boost_id',
        });

      if (error) throw error;

      // Update local state
      const existing = predictions.find(p => p.custom_boost_id === customBoostId);
      if (existing) {
        setPredictions(predictions.map(p => 
          p.custom_boost_id === customBoostId 
            ? { ...p, predicted_team_code: teamCode, predicted_player_name: playerName }
            : p
        ));
      } else {
        setPredictions([...predictions, {
          id: crypto.randomUUID(),
          custom_boost_id: customBoostId,
          predicted_team_code: teamCode,
          predicted_player_name: playerName,
        }]);
      }
      return true;
    } catch (err) {
      console.error('Error saving custom boost prediction:', err);
      return false;
    }
  };

  const getPrediction = (customBoostId: string): CustomBoostPrediction | undefined => {
    return predictions.find(p => p.custom_boost_id === customBoostId);
  };

  const getResult = (customBoostId: string): CustomBoostResult | undefined => {
    return results.find(r => r.custom_boost_id === customBoostId);
  };

  const isLocked = (award: CustomBoostAward): boolean => {
    if (!award.lock_date) return false;
    return new Date() >= new Date(award.lock_date);
  };

  const calculatePoints = (customBoostId: string): number => {
    const prediction = getPrediction(customBoostId);
    const result = getResult(customBoostId);
    const award = awards.find(a => a.id === customBoostId);
    
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
