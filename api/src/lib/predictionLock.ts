// Single source of truth for the server-side prediction lock decision,
// extracted from the route handler so it can be unit-tested without a DB
// or HTTP layer. The lock was once UI-only; a crafted POST could edit a
// prediction after kickoff and bank points (fixed June 2026). These pure
// predicates pin the exact semantics so a future refactor can't silently
// reopen the hole.

// Match predictions close 30 minutes before kickoff — must match the UI
// (useMatchTime: minutesUntilStart - 30).
export const PREDICTION_LOCK_MINUTES = 30;

/**
 * Is a match prediction locked at time `nowMs`?
 * - `kickoffMs` null/non-finite → unknown match (e.g. a knockout bracket
 *   slot not yet synced into live_matches). Not locked: it hasn't kicked
 *   off, and becomes covered once synced as an fd-* id.
 * - otherwise locked once now is within 30 min of kickoff (inclusive),
 *   and of course after kickoff / full time.
 */
export function isPredictionLocked(kickoffMs: number | null, nowMs: number): boolean {
  if (kickoffMs === null || !Number.isFinite(kickoffMs)) return false;
  return nowMs >= kickoffMs - PREDICTION_LOCK_MINUTES * 60_000;
}

/**
 * Is a boost prediction locked at time `nowMs`? Boosts (standard +
 * custom) all close at one tournament-wide deadline — the first knockout
 * kickoff (see getBoostDeadlineMs / the client's boostsDeadline). Null
 * deadline → no KO fixture synced yet → open.
 */
export function isBoostLocked(deadlineMs: number | null, nowMs: number): boolean {
  if (deadlineMs === null || !Number.isFinite(deadlineMs)) return false;
  return nowMs >= deadlineMs;
}
