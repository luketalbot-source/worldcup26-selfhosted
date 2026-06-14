import { sql } from "../db";

// All boost predictions — standard and tenant-custom — lock at a single
// tournament-wide moment: the kickoff of the first knockout match. This
// mirrors the client's `boostsDeadline` (LiveMatchesContext: min
// match_date of any non-group fixture). The lock was previously only
// enforced in the UI; the POST endpoints accepted writes regardless,
// the same class of hole as the match-prediction endpoint.
//
// Returns null when no knockout fixture is in live_matches yet (deadline
// unknown → not locked, matching the client's `!boostsDeadline` branch).
// Once the KO bracket is synced this returns the real cutoff and both
// boost write paths reject late writes.
export async function getBoostDeadlineMs(): Promise<number | null> {
  const rows = await sql<{ min_ko: string | null }[]>`
    SELECT MIN(match_date) AS min_ko
      FROM public.live_matches
     WHERE stage <> 'group' AND match_date IS NOT NULL
  `;
  const v = rows[0]?.min_ko;
  if (!v) return null;
  const ms = new Date(v).getTime();
  return Number.isFinite(ms) ? ms : null;
}

export const BOOSTS_LOCKED_ERROR =
  "Boost predictions are locked — they close at the first knockout kickoff.";
