import { useEffect, useState } from 'react';
import { api } from '@/lib/apiClient';
import { useAuth } from '@/contexts/AuthContext';

export interface Prediction {
  matchId: string;
  homeScore: number;
  awayScore: number;
  timestamp: string;
}

interface ApiPrediction {
  match_id: string;
  home_score: number;
  away_score: number;
  updated_at: string;
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

    const params: Record<string, string | undefined> = {};
    if (tenantId) params.tenant_id = tenantId;

    try {
      const data = await api.get<ApiPrediction[]>('/predictions', params);
      setPredictions((data || []).map(p => ({
        matchId: p.match_id,
        homeScore: p.home_score,
        awayScore: p.away_score,
        timestamp: p.updated_at,
      })));
    } catch {
      // leave predictions as-is on error
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPredictions();
  }, [user, tenantId]);

  const addPrediction = async (matchId: string, homeScore: number, awayScore: number) => {
    if (!user) return;

    try {
      await api.post('/predictions', {
        match_id: matchId,
        home_score: homeScore,
        away_score: awayScore,
        ...(tenantId ? { tenant_id: tenantId } : {}),
      });

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
    } catch (err) {
      console.error('Error saving prediction:', err);
    }
  };

  const getPrediction = (matchId: string): Prediction | undefined => {
    return predictions.find(p => p.matchId === matchId);
  };

  return { predictions, addPrediction, getPrediction, loading, refetch: fetchPredictions };
};
