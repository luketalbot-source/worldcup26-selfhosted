import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export interface Prediction {
  matchId: string;
  homeScore: number;
  awayScore: number;
  timestamp: string;
}

export const usePredictions = (tenantId?: string | null) => {
  const { user } = useAuth();
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchPredictions = async () => {
    if (!user) {
      setPredictions([]);
      setLoading(false);
      return;
    }
    
    setLoading(true);
    const { data, error } = await supabase
      .from('predictions')
      .select('*')
      .eq('user_id', user.id);

    if (!error && data) {
      setPredictions(data.map(p => ({
        matchId: p.match_id,
        homeScore: p.home_score,
        awayScore: p.away_score,
        timestamp: p.updated_at,
      })));
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchPredictions();
  }, [user]);

  const addPrediction = async (matchId: string, homeScore: number, awayScore: number) => {
    if (!user) return;

    // Get user's tenant_id from profile if not provided
    let effectiveTenantId = tenantId;
    if (!effectiveTenantId) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('tenant_id')
        .eq('user_id', user.id)
        .maybeSingle();
      effectiveTenantId = profile?.tenant_id;
    }

    const { error } = await supabase
      .from('predictions')
      .upsert({
        user_id: user.id,
        match_id: matchId,
        home_score: homeScore,
        away_score: awayScore,
        tenant_id: effectiveTenantId,
      }, {
        onConflict: 'user_id,match_id',
      });

    if (!error) {
      // Update local state
      const existing = predictions.find(p => p.matchId === matchId);
      if (existing) {
        setPredictions(predictions.map(p => 
          p.matchId === matchId 
            ? { ...p, homeScore, awayScore, timestamp: new Date().toISOString() }
            : p
        ));
      } else {
        setPredictions([...predictions, {
          matchId,
          homeScore,
          awayScore,
          timestamp: new Date().toISOString(),
        }]);
      }
    }
  };

  const getPrediction = (matchId: string): Prediction | undefined => {
    return predictions.find(p => p.matchId === matchId);
  };

  return { predictions, addPrediction, getPrediction, loading, refetch: fetchPredictions };
};
