// Guards openPlayScore: football-data.org folds the penalty-shootout tally
// into score.fullTime for PSO matches, so the stored home/away score must be
// de-inflated back to the open-play (AET) result — otherwise the displayed
// scoreline is wrong AND predictions get scored against the inflated total
// (e.g. a correct 1-1 draw call graded as a loss). Run: `bun test` (in api/).
import { describe, expect, test } from "bun:test";

// matchSync.ts transitively imports db.ts, which requires DATABASE_URL at load
// time. openPlayScore is pure (no DB), and the postgres client is lazy (never
// connects without a query), so a dummy URL is enough to load the module.
process.env.DATABASE_URL ||= "postgres://test:test@localhost:5432/test";
const { openPlayScore, mapStage, NON_KNOCKOUT_STAGES } = await import("./matchSync");

describe("openPlayScore — de-inflate FD's pens-in-fullTime", () => {
  test("PSO with pens folded into fullTime → recovers the AET draw", () => {
    // 1-1 AET, won 4-3 on pens → FD reports fullTime 5-4
    expect(openPlayScore(5, 4, 4, 3, "PENALTY_SHOOTOUT")).toEqual({ home: 1, away: 1 });
    // 1-1 AET, the GER-PAR screenshot moment (pens 2-3) → fullTime 3-4
    expect(openPlayScore(3, 4, 2, 3, "PENALTY_SHOOTOUT")).toEqual({ home: 1, away: 1 });
  });

  test("PSO mid-shootout with the pens level still resolves to the AET draw", () => {
    // 1-1 AET, shootout tied 4-4 → fullTime 5-5 (the live DB state)
    expect(openPlayScore(5, 5, 4, 4, "PENALTY_SHOOTOUT")).toEqual({ home: 1, away: 1 });
  });

  test("PSO whose fullTime already reads as AET-only is left unchanged", () => {
    // 1-1 AET, pens 4-3: subtracting gives -3 vs -2 (not a draw) → keep as-is
    expect(openPlayScore(1, 1, 4, 3, "PENALTY_SHOOTOUT")).toEqual({ home: 1, away: 1 });
  });

  test("regular and extra-time matches are never adjusted", () => {
    expect(openPlayScore(2, 1, null, null, "REGULAR")).toEqual({ home: 2, away: 1 });
    expect(openPlayScore(2, 1, null, null, "EXTRA_TIME")).toEqual({ home: 2, away: 1 });
  });

  test("unplayed match (null scores) passes through", () => {
    expect(openPlayScore(null, null, null, null, null)).toEqual({ home: null, away: null });
  });
});

// Multi-competition stage taxonomy: domestic leagues are all REGULAR_SEASON;
// the Swiss-format CL has LEAGUE_STAGE + a PLAYOFFS round before LAST_16.
// The boost deadline + matches route's group/knockout split both build on
// these mappings, so pin them.
describe("mapStage — club-competition additions", () => {
  test("Bundesliga fixtures map to 'regular'", () => {
    expect(mapStage("REGULAR_SEASON")).toBe("regular");
  });
  test("CL league phase + playoff round", () => {
    expect(mapStage("LEAGUE_STAGE")).toBe("league");
    expect(mapStage("PLAYOFFS")).toBe("playoff");
  });
  test("WC mappings unchanged", () => {
    expect(mapStage("GROUP_STAGE")).toBe("group");
    expect(mapStage("LAST_32")).toBe("round32");
    expect(mapStage("FINAL")).toBe("final");
  });
  test("unknown labels fall back to lowercase, never 'group'", () => {
    expect(mapStage("SOME_NEW_THING")).toBe("some_new_thing");
  });
  test("non-knockout set covers all three regular-phase stages", () => {
    expect(NON_KNOCKOUT_STAGES).toEqual(["group", "regular", "league"]);
    // and knockout stages are NOT in it
    for (const s of ["playoff", "round32", "round16", "quarter", "semi", "third", "final"]) {
      expect(NON_KNOCKOUT_STAGES).not.toContain(s);
    }
  });
});
