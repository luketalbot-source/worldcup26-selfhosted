// Venue → IANA timezone for the 16 WC2026 host stadiums.
//
// Why: "today's matches" must be grouped by the MATCH-DAY AT THE VENUE,
// not the user's calendar day. A 20:00 kickoff in New Jersey is 02:00
// next-day in Germany — European users were seeing tonight's late games
// fall off the Today tab while the venue (and the official match
// schedule) still called them today's games. Kickoff times shown to the
// user stay in the user's own timezone (useMatchTime is unaffected).
//
// Matching is regex-on-substring rather than exact keys because
// football-data.org renames things mid-tournament without notice — they
// shipped "Azteca" and "AKRON" where our static fixture data said
// "Estadio Azteca" / "Estadio Akron", and renamed two team TLAs the
// same week. Substrings survive that class of churn.
const VENUE_TZ_PATTERNS: Array<[RegExp, string]> = [
  // Eastern
  [/metlife/i, 'America/New_York'],
  [/gillette/i, 'America/New_York'],
  [/hard rock/i, 'America/New_York'],
  [/mercedes[- ]benz/i, 'America/New_York'],
  [/lincoln financial/i, 'America/New_York'],
  [/bmo field/i, 'America/Toronto'],
  // Central
  [/at&t/i, 'America/Chicago'],
  [/arrowhead/i, 'America/Chicago'],
  [/nrg/i, 'America/Chicago'],
  // Pacific
  [/sofi/i, 'America/Los_Angeles'],
  [/lumen/i, 'America/Los_Angeles'],
  [/levi/i, 'America/Los_Angeles'],
  [/bc place/i, 'America/Vancouver'],
  // Mexico (no DST since 2022 — CST year-round)
  [/azteca/i, 'America/Mexico_City'],
  [/akron/i, 'America/Mexico_City'],
  [/bbva/i, 'America/Monterrey'],
];

export function getVenueTimezone(venue: string | null | undefined): string | null {
  if (!venue) return null;
  for (const [pattern, tz] of VENUE_TZ_PATTERNS) {
    if (pattern.test(venue)) return tz;
  }
  return null;
}

/**
 * Is this kickoff "today" from the venue's point of view? Computes both
 * the kickoff date and the current date in the venue's timezone and
 * compares the calendar days. Falls back to the user's local calendar
 * day when the venue is unknown (TBD fixtures, future venues FD hasn't
 * named yet) — same behaviour the app had before venue-day grouping.
 */
export function isMatchToday(
  matchDateIso: string,
  venue: string | null | undefined,
  now: Date = new Date(),
): boolean {
  const tz = getVenueTimezone(venue);
  const kickoff = new Date(matchDateIso);
  if (Number.isNaN(kickoff.getTime())) return false;
  // en-CA renders YYYY-MM-DD, making string equality a date comparison.
  const opts = tz ? ({ timeZone: tz } as const) : undefined;
  return kickoff.toLocaleDateString('en-CA', opts) === now.toLocaleDateString('en-CA', opts);
}
