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
/**
 * Penalty-shootout prediction + result, for knockout matches that go to
 * pens. All optional — group games and decisive knockouts pass nothing
 * and scoring is unchanged. Mirrors the server scoring in
 * api/src/routes/leaderboard.ts.
 */
export interface PenaltyScoring {
  predictedPenHome?: number | null;
  predictedPenAway?: number | null;
  actualPenHome?: number | null;
  actualPenAway?: number | null;
  /** actual match.duration === 'PENALTY_SHOOTOUT' */
  wentToPens?: boolean;
}

export const calculatePredictionPoints = (
  predictedHome: number,
  predictedAway: number,
  actualHome: number | null,
  actualAway: number | null,
  pens?: PenaltyScoring,
): { points: number; resultType: 'exact' | 'correct' | 'wrong' | 'pending'; penaltyBonus: number } => {
  // If match hasn't finished yet (no scores), return pending
  if (actualHome === null || actualAway === null) {
    return { points: 0, resultType: 'pending', penaltyBonus: 0 };
  }

  const wentToPens = !!pens?.wentToPens && pens.actualPenHome != null && pens.actualPenAway != null;
  const predictedDecisive = predictedHome !== predictedAway;
  // Did the user back the side that won a shootout? (decisive prediction
  // on a match that went to pens — they called who advances, not the draw)
  const decisiveAdvancerCorrect =
    wentToPens && predictedDecisive &&
    (predictedHome > predictedAway) === ((pens!.actualPenHome as number) > (pens!.actualPenAway as number));

  let base: number;
  let resultType: 'exact' | 'correct' | 'wrong';
  if (predictedHome === actualHome && predictedAway === actualAway) {
    base = 3;
    resultType = 'exact';
  } else if (getResult(predictedHome, predictedAway) === getResult(actualHome, actualAway)) {
    base = 1;
    resultType = 'correct';
  } else if (decisiveAdvancerCorrect) {
    base = 1;
    resultType = 'correct';
  } else {
    base = 0;
    resultType = 'wrong';
  }

  // Shootout bonus: only when the match actually went to pens AND the
  // user predicted a level score with a decisive shootout pick.
  // +1 correct winner, +1 more for the exact shootout score.
  let penaltyBonus = 0;
  if (
    pens?.wentToPens &&
    predictedHome === predictedAway &&
    pens.predictedPenHome != null && pens.predictedPenAway != null &&
    pens.predictedPenHome !== pens.predictedPenAway &&
    pens.actualPenHome != null && pens.actualPenAway != null
  ) {
    const predHomeWins = pens.predictedPenHome > pens.predictedPenAway;
    const actualHomeWins = pens.actualPenHome > pens.actualPenAway;
    if (predHomeWins === actualHomeWins) penaltyBonus += 1;
    if (pens.predictedPenHome === pens.actualPenHome && pens.predictedPenAway === pens.actualPenAway) penaltyBonus += 1;
  }

  return { points: base + penaltyBonus, resultType, penaltyBonus };
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
