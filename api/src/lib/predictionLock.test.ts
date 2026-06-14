// Regression guard for the prediction/boost server-side lock (the lock
// was once UI-only — a crafted POST could edit a prediction after
// kickoff and bank points). These pin the exact cutoff semantics so a
// refactor can't silently reopen the hole. Run: `bun test` (in api/).
import { describe, expect, test } from "bun:test";
import {
  isPredictionLocked,
  isBoostLocked,
  PREDICTION_LOCK_MINUTES,
} from "./predictionLock";

const MIN = 60_000;
// Fixed reference kickoff so the cases read clearly (value is arbitrary).
const KO = Date.parse("2026-06-14T20:00:00Z");

describe("isPredictionLocked", () => {
  test("open well before kickoff (31+ min)", () => {
    expect(isPredictionLocked(KO, KO - 31 * MIN)).toBe(false);
    expect(isPredictionLocked(KO, KO - 6 * 60 * MIN)).toBe(false);
  });

  test("locks exactly at the 30-min cutoff (inclusive)", () => {
    expect(isPredictionLocked(KO, KO - PREDICTION_LOCK_MINUTES * MIN)).toBe(true);
  });

  test("locked inside the final 30 min", () => {
    expect(isPredictionLocked(KO, KO - 29 * MIN)).toBe(true);
    expect(isPredictionLocked(KO, KO - 1 * MIN)).toBe(true);
  });

  test("locked at kickoff and after full time — the exploit window", () => {
    expect(isPredictionLocked(KO, KO)).toBe(true);
    expect(isPredictionLocked(KO, KO + 60 * MIN)).toBe(true); // live
    expect(isPredictionLocked(KO, KO + 6 * 60 * MIN)).toBe(true); // post-FT
  });

  test("unknown kickoff (unsynced knockout slot) stays open", () => {
    expect(isPredictionLocked(null, KO + 6 * 60 * MIN)).toBe(false);
    expect(isPredictionLocked(NaN, KO)).toBe(false);
  });
});

describe("isBoostLocked", () => {
  test("open before the deadline", () => {
    expect(isBoostLocked(KO, KO - 1 * MIN)).toBe(false);
  });

  test("locks at and after the deadline (first KO kickoff, no grace)", () => {
    expect(isBoostLocked(KO, KO)).toBe(true);
    expect(isBoostLocked(KO, KO + 1 * MIN)).toBe(true);
  });

  test("no deadline yet (no KO fixture synced) stays open", () => {
    expect(isBoostLocked(null, KO)).toBe(false);
    expect(isBoostLocked(NaN, KO)).toBe(false);
  });
});
