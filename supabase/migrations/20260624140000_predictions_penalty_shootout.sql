-- Penalty-shootout prediction for knockout matches.
--
-- Knockout games can't end level: a drawn 90+ET goes to a shootout. When
-- a user predicts a level score for a knockout fixture they must also
-- predict the shootout score (UI-enforced). Scoring (knockout matches
-- that actually went to pens, on top of the normal 3/1 for the AET
-- score): +1 for the correct shootout winner, +1 more for the exact
-- shootout score.
--
-- Nullable: group-stage predictions and decisive-score knockout
-- predictions leave these null. The live result's own shootout columns
-- already live on live_matches (penalty_home_score/penalty_away_score,
-- duration='PENALTY_SHOOTOUT').

ALTER TABLE public.predictions
  ADD COLUMN IF NOT EXISTS penalty_home_score INTEGER,
  ADD COLUMN IF NOT EXISTS penalty_away_score INTEGER;
