// Pins the results-export per-match scoring to the leaderboard spec
// (api/src/routes/leaderboard.ts). The knockout penalty branches only
// fire once a real shootout happens in prod, so these lock the math —
// base 3/1/0, the decisive-advancer result point, and the shootout bonus
// (+1 correct winner, +1 exact shootout score) — before they go live.
// Run: `bun test` (in api/).
import { describe, expect, test } from "bun:test";
import {
  scoreMatch,
  boostPoints,
  boostResultIncludes,
  normalizeWinners,
  type Match,
  type MatchPrediction,
} from "./resultsExport";

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

// A boost result may list several winners (comma-separated) for a tie. These
// pin the shared matcher used by boostPoints, and mirror the SQL scorers'
// `predicted = ANY(string_to_array(result, ','))`.
describe("boostResultIncludes — single & tied winners", () => {
  test("single winner: exact match", () => {
    expect(boostResultIncludes("FRA", "FRA")).toBe(true);
    expect(boostResultIncludes("FRA", "ENG")).toBe(false);
  });
  test("tie: either winner matches", () => {
    expect(boostResultIncludes("ENG,FRA", "ENG")).toBe(true);
    expect(boostResultIncludes("ENG,FRA", "FRA")).toBe(true);
    expect(boostResultIncludes("ENG,FRA", "ESP")).toBe(false);
  });
  test("tolerates stray spaces around a separator", () => {
    expect(boostResultIncludes("ENG, FRA", "FRA")).toBe(true);
    expect(boostResultIncludes("ENG,FRA", " ENG ")).toBe(true);
  });
  test("null/blank inputs never match", () => {
    expect(boostResultIncludes(null, "FRA")).toBe(false);
    expect(boostResultIncludes("", "FRA")).toBe(false);
    expect(boostResultIncludes("ENG,FRA", null)).toBe(false);
    expect(boostResultIncludes("ENG,FRA", "")).toBe(false);
  });
  test("player-name winners (with internal spaces) split only on comma", () => {
    expect(boostResultIncludes("Lionel Messi,Kylian Mbappé", "Kylian Mbappé")).toBe(true);
    expect(boostResultIncludes("Lionel Messi", "Lionel Messi")).toBe(true);
    expect(boostResultIncludes("Lionel Messi,Kylian Mbappé", "Lionel")).toBe(false);
  });
});

// normalizeWinners runs on every result write (built-in + custom) so stored
// values are clean and the SQL scorers (which split without trimming) agree
// with the JS scorers.
describe("normalizeWinners — clean storage form", () => {
  test("single value passes through", () => {
    expect(normalizeWinners("FRA")).toBe("FRA");
  });
  test("tie is joined without spaces", () => {
    expect(normalizeWinners("ENG,FRA")).toBe("ENG,FRA");
    expect(normalizeWinners("ENG, FRA")).toBe("ENG,FRA");
    expect(normalizeWinners(" ENG , FRA ")).toBe("ENG,FRA");
  });
  test("blanks & trailing separators dropped", () => {
    expect(normalizeWinners("ENG,")).toBe("ENG");
    expect(normalizeWinners("ENG,,FRA")).toBe("ENG,FRA");
    expect(normalizeWinners("  ")).toBeNull();
    expect(normalizeWinners("")).toBeNull();
    expect(normalizeWinners(null)).toBeNull();
  });
  test("player names keep internal spaces, split only on comma", () => {
    expect(normalizeWinners("Lionel Messi, Kylian Mbappé")).toBe("Lionel Messi,Kylian Mbappé");
  });
});

describe("boostPoints — tie awards points to every backed winner", () => {
  const teamResult = { award_id: "a1", result_team_code: "ENG,FRA", result_player_name: null };
  test("picked one of the tied teams → full points", () => {
    expect(boostPoints({ predicted_team_code: "ENG", predicted_player_name: null }, teamResult, 5, "team")).toBe(5);
    expect(boostPoints({ predicted_team_code: "FRA", predicted_player_name: null }, teamResult, 5, "team")).toBe(5);
  });
  test("picked a non-winner → 0", () => {
    expect(boostPoints({ predicted_team_code: "ARG", predicted_player_name: null }, teamResult, 5, "team")).toBe(0);
  });
  test("single-winner result still scores exactly (back-compat)", () => {
    const single = { award_id: "a1", result_team_code: "ESP", result_player_name: null };
    expect(boostPoints({ predicted_team_code: "ESP", predicted_player_name: null }, single, 5, "team")).toBe(5);
    expect(boostPoints({ predicted_team_code: "FRA", predicted_player_name: null }, single, 5, "team")).toBe(0);
  });
  test("no result row → blank", () => {
    expect(boostPoints({ predicted_team_code: "ENG", predicted_player_name: null }, undefined, 5, "team")).toBe("");
  });
  test("result row exists but column blank → blank", () => {
    expect(
      boostPoints({ predicted_team_code: "ENG", predicted_player_name: null }, { award_id: "a1", result_team_code: null, result_player_name: null }, 5, "team"),
    ).toBe("");
  });
});
