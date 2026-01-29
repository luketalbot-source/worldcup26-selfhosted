/**
 * Scoring Calculator for World Cup Predictions
 * 
 * Points System:
 * - 3 points: Exact score match
 * - 1 point: Correct result (winner/draw) but wrong score
 * - 0 points: Wrong result
 */

export interface PredictionResult {
  matchId: string;
  predictedHome: number;
  predictedAway: number;
  actualHome: number;
  actualAway: number;
  points: number;
  resultType: 'exact' | 'correct' | 'wrong';
}

export interface UserStats {
  totalPoints: number;
  matchPoints: number;
  boostPoints: number;
  exactScores: number;
  correctResults: number;
  wrongResults: number;
  totalPredictions: number;
  accuracy: number; // percentage of correct or exact predictions
}

/**
 * Calculate points for a single prediction
 */
export const calculatePredictionPoints = (
  predictedHome: number,
  predictedAway: number,
  actualHome: number | null,
  actualAway: number | null
): { points: number; resultType: 'exact' | 'correct' | 'wrong' | 'pending' } => {
  // If match hasn't finished yet (no scores), return pending
  if (actualHome === null || actualAway === null) {
    return { points: 0, resultType: 'pending' };
  }

  // Exact score match = 3 points
  if (predictedHome === actualHome && predictedAway === actualAway) {
    return { points: 3, resultType: 'exact' };
  }

  // Check if result (winner/draw) is correct
  const predictedResult = getResult(predictedHome, predictedAway);
  const actualResult = getResult(actualHome, actualAway);

  if (predictedResult === actualResult) {
    return { points: 1, resultType: 'correct' };
  }

  // Wrong result = 0 points
  return { points: 0, resultType: 'wrong' };
};

/**
 * Get the result type (home win, away win, or draw)
 */
const getResult = (homeScore: number, awayScore: number): 'home' | 'away' | 'draw' => {
  if (homeScore > awayScore) return 'home';
  if (awayScore > homeScore) return 'away';
  return 'draw';
};

/**
 * Calculate stats for a user based on their predictions and actual match results
 */
export const calculateUserStats = (
  predictions: Array<{ match_id: string; home_score: number; away_score: number }>,
  finishedMatches: Map<string, { home_score: number | null; away_score: number | null }>,
  boostPoints: number = 0,
  totalPredictionCount?: number
): UserStats => {
  let matchPoints = 0;
  let exactScores = 0;
  let correctResults = 0;
  let wrongResults = 0;
  let scoredPredictions = 0;

  for (const prediction of predictions) {
    const match = finishedMatches.get(prediction.match_id);
    
    // Only count predictions for finished matches
    if (match && match.home_score !== null && match.away_score !== null) {
      scoredPredictions++;
      
      const { points, resultType } = calculatePredictionPoints(
        prediction.home_score,
        prediction.away_score,
        match.home_score,
        match.away_score
      );

      matchPoints += points;

      switch (resultType) {
        case 'exact':
          exactScores++;
          break;
        case 'correct':
          correctResults++;
          break;
        case 'wrong':
          wrongResults++;
          break;
      }
    }
  }

  const accuracy = scoredPredictions > 0
    ? Math.round(((exactScores + correctResults) / scoredPredictions) * 100)
    : 0;

  // Use provided total prediction count if available, otherwise fall back to match predictions only
  const finalTotalPredictions = totalPredictionCount !== undefined ? totalPredictionCount : predictions.length;

  return {
    totalPoints: matchPoints + boostPoints,
    matchPoints,
    boostPoints,
    exactScores,
    correctResults,
    wrongResults,
    totalPredictions: finalTotalPredictions,
    accuracy,
  };
};
