import { sql } from "../db";
import { getCompetitionById, type Competition } from "./competitions";
import { NON_KNOCKOUT_STAGES } from "./matchSync";

// All boost predictions — standard and tenant-custom — lock at one moment
// PER COMPETITION. The strategy depends on the competition's format:
//
//   - explicit: competitions.boost_lock_at, when set, always wins. The
//     WC2026 archive has this pinned to its historical first-knockout
//     kickoff by the Phase A migration, so its lock can never drift.
//   - tournament/hybrid: kickoff of the first knockout fixture (the
//     original WC behavior, generalized — 'group'/'league'/'regular'
//     stages don't count as knockout, see NON_KNOCKOUT_STAGES).
//   - league: kickoff of the FIRST fixture of the season. A domestic
//     league has no knockout stage at all, so the old expression returned
//     NULL and season-long boosts ("who wins the title") never locked.
//
// Returns null when the deadline is unknowable yet (fixtures not synced) —
// not locked, matching the client's `!boostsDeadline` branch.
export async function getBoostDeadlineMs(competitionId: string): Promise<number | null> {
  const comp = await getCompetitionById(competitionId);
  if (!comp) return null;

  if (comp.boost_lock_at) {
    const ms = new Date(comp.boost_lock_at).getTime();
    return Number.isFinite(ms) ? ms : null;
  }
  return derivedDeadlineMs(comp);
}

async function derivedDeadlineMs(comp: Competition): Promise<number | null> {
  const rows =
    comp.format === "league"
      ? await sql<{ min_ko: string | null }[]>`
          SELECT MIN(match_date) AS min_ko
            FROM public.live_matches
           WHERE competition_id = ${comp.id} AND match_date IS NOT NULL
        `
      : await sql<{ min_ko: string | null }[]>`
          SELECT MIN(match_date) AS min_ko
            FROM public.live_matches
           WHERE competition_id = ${comp.id}
             AND stage <> ALL(${NON_KNOCKOUT_STAGES})
             AND match_date IS NOT NULL
        `;
  const v = rows[0]?.min_ko;
  if (!v) return null;
  const ms = new Date(v).getTime();
  return Number.isFinite(ms) ? ms : null;
}

export const BOOSTS_LOCKED_ERROR =
  "Boost predictions are locked for this competition.";
