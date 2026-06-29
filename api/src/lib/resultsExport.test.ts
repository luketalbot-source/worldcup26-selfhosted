// Pins the results-export per-match scoring to the leaderboard spec
// (api/src/routes/leaderboard.ts). The knockout penalty branches only
// fire once a real shootout happens in prod, so these lock the math —
// base 3/1/0, the decisive-advancer result point, and the shootout bonus
// (+1 correct winner, +1 exact shootout score) — before they go live.
// Run: `bun test` (in api/).
import { describe, expect, test } from "bun:test";
import { scoreMatch, type Match, type MatchPrediction } from "./resultsExport";

const mkMatch = (over: Partial<Match>): Match => ({
  match_id: "fd-1",
  match_date: "2026-06-28T19:00:00Z",
  home_team_code: "ARG",
  home_team_name: "Argentina",
  away_team_code: "BRA",
  away_team_name: "Brazil",
  home_score: null,
  away_score: null,
  penalty_home_score: null,
  penalty_away_score: null,
  duration: null,
  ...over,
});

const mkPred = (over: Partial<MatchPrediction>): MatchPrediction => ({
  user_id: "u1",
  match_id: "fd-1",
  home_score: 0,
  away_score: 0,
  penalty_home_score: null,
  penalty_away_score: null,
  ...over,
});

describe("scoreMatch — group / open-play (no pens)", () => {
  test("unplayed match → blank pts", () => {
    const s = scoreMatch(mkPred({ home_score: 2, away_score: 1 }), mkMatch({}));
    expect(s.pts).toBe("");
    expect(s.isExact).toBe(false);
    expect(s.goalDiff).toBe(0);
  });

  test("exact score → 3", () => {
    const s = scoreMatch(
      mkPred({ home_score: 2, away_score: 1 }),
      mkMatch({ home_score: 2, away_score: 1, duration: "REGULAR" }),
    );
    expect(s.pts).toBe(3);
    expect(s.isExact).toBe(true);
    expect(s.isCorrectResult).toBe(false);
    expect(s.goalDiff).toBe(0);
  });

  test("correct result, wrong score → 1", () => {
    const s = scoreMatch(
      mkPred({ home_score: 1, away_score: 0 }),
      mkMatch({ home_score: 2, away_score: 0, duration: "REGULAR" }),
    );
    expect(s.pts).toBe(1);
    expect(s.isExact).toBe(false);
    expect(s.isCorrectResult).toBe(true);
    expect(s.goalDiff).toBe(1); // |1-2| + |0-0|
  });

  test("wrong result → 0", () => {
    const s = scoreMatch(
      mkPred({ home_score: 0, away_score: 1 }),
      mkMatch({ home_score: 2, away_score: 0, duration: "REGULAR" }),
    );
    expect(s.pts).toBe(0);
    expect(s.isCorrectResult).toBe(false);
    expect(s.goalDiff).toBe(3); // |0-2| + |1-0|
  });
});

describe("scoreMatch — knockout shootout (predicted a draw)", () => {
  // Actual: 1–1 after ET, home wins the shootout 4–2.
  const pens = { home_score: 1, away_score: 1, duration: "PENALTY_SHOOTOUT" as const, penalty_home_score: 4, penalty_away_score: 2 };

  test("exact AET + exact shootout score → 3 + 1 + 1 = 5", () => {
    const s = scoreMatch(
      mkPred({ home_score: 1, away_score: 1, penalty_home_score: 4, penalty_away_score: 2 }),
      mkMatch(pens),
    );
    expect(s.isExact).toBe(true);
    expect(s.penaltyBonus).toBe(2);
    expect(s.pts).toBe(5);
  });

  test("correct AET result (not exact) + correct shootout winner only → 1 + 1 = 2", () => {
    const s = scoreMatch(
      mkPred({ home_score: 2, away_score: 2, penalty_home_score: 5, penalty_away_score: 1 }),
      mkMatch(pens),
    );
    expect(s.isExact).toBe(false);
    expect(s.isCorrectResult).toBe(true);
    expect(s.penaltyBonus).toBe(1); // right winner, wrong shootout score
    expect(s.pts).toBe(2);
  });

  test("exact AET + WRONG shootout winner → 3 + 0 = 3", () => {
    const s = scoreMatch(
      mkPred({ home_score: 1, away_score: 1, penalty_home_score: 3, penalty_away_score: 5 }),
      mkMatch(pens),
    );
    expect(s.isExact).toBe(true);
    expect(s.penaltyBonus).toBe(0);
    expect(s.pts).toBe(3);
  });
});

describe("scoreMatch — knockout shootout (predicted a decisive winner)", () => {
  // Actual: 1–1 after ET, AWAY wins the shootout 3–5.
  const awayWinsPens = { home_score: 1, away_score: 1, duration: "PENALTY_SHOOTOUT" as const, penalty_home_score: 3, penalty_away_score: 5 };

  test("decisive-advancer: backed the side that won the shootout → 1", () => {
    const s = scoreMatch(
      mkPred({ home_score: 1, away_score: 2 }), // predicted away win
      mkMatch(awayWinsPens),
    );
    expect(s.isCorrectResult).toBe(false); // open play was a draw
    expect(s.penaltyBonus).toBe(0); // no shootout-score pick on a decisive prediction
    expect(s.pts).toBe(1);
  });

  test("decisive prediction, backed side LOST the shootout → 0", () => {
    const s = scoreMatch(
      mkPred({ home_score: 2, away_score: 1 }), // predicted home win, home lost pens
      mkMatch(awayWinsPens),
    );
    expect(s.pts).toBe(0);
  });
});

describe("scoreMatch — shootout prediction ignored when match did not go to pens", () => {
  test("predicted draw + pens, but match was decided in ET → no bonus, no result point", () => {
    const s = scoreMatch(
      mkPred({ home_score: 1, away_score: 1, penalty_home_score: 5, penalty_away_score: 4 }),
      mkMatch({ home_score: 2, away_score: 1, duration: "EXTRA_TIME" }),
    );
    expect(s.penaltyBonus).toBe(0);
    expect(s.pts).toBe(0); // predicted a draw, match was a home win
  });
});
