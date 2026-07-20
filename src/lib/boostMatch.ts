// A boost result may name several winners when a category ends in a tie
// (e.g. two teams share the most goals). They are stored comma-separated in
// the single result_team_code / result_player_name column ("ENG,FRA").
//
// These helpers match the backend scorers:
//   - JS:  boostResultIncludes() in api/src/lib/resultsExport.ts
//   - SQL: predicted = ANY(string_to_array(result, ',')) in leaderboard.ts / tenants.ts
// Result values are normalised on write (normalizeWinners in both boost write
// paths), so the stored form is a clean comma-joined list and all scorers agree;
// the trims here are defensive. A comma-free value behaves as an exact match, so
// single-winner results are unaffected.

/** Split a stored result value into its individual winners. */
export function parseBoostResult(value: string | null | undefined): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/** True when `predicted` is one of the winners named in `resultValue`. */
export function boostResultIncludes(
  resultValue: string | null | undefined,
  predicted: string | null | undefined,
): boolean {
  if (!predicted) return false;
  return parseBoostResult(resultValue).includes(predicted.trim());
}
