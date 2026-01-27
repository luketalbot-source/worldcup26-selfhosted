import { useState, useEffect } from 'react';
import { Prediction } from '@/types/match';

const STORAGE_KEY = 'wc2026_predictions';

export const usePredictions = () => {
  const [predictions, setPredictions] = useState<Prediction[]>(() => {
    if (typeof window === 'undefined') return [];
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(predictions));
  }, [predictions]);

  const addPrediction = (matchId: string, homeScore: number, awayScore: number) => {
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
  };

  const getPrediction = (matchId: string): Prediction | undefined => {
    return predictions.find(p => p.matchId === matchId);
  };

  return { predictions, addPrediction, getPrediction };
};
