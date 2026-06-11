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
 * Signed difference in calendar days between the kickoff and "now",
 * both evaluated in the VENUE's timezone: 0 = today at the venue,
 * -1 = yesterday, +1 = tomorrow, etc. Falls back to the user's local
 * calendar when the venue is unknown (TBD fixtures, venues FD hasn't
 * named yet). Returns null for unparseable dates.
 *
 * Powers the Today tab's day filters (Past / Yesterday / Today /
 * Tomorrow / Future) — all of them venue-day semantics so they match
 * the official matchday schedule rather than the user's clock.
 */
export function venueDayOffset(
  matchDateIso: string,
  venue: string | null | undefined,
  now: Date = new Date(),
): number | null {
  const kickoff = new Date(matchDateIso);
  if (Number.isNaN(kickoff.getTime())) return null;
  const tz = getVenueTimezone(venue);
  // en-CA renders YYYY-MM-DD; parsing those back as UTC midnights makes
  // the subtraction a pure calendar-day difference, immune to DST.
  const opts = tz ? ({ timeZone: tz } as const) : undefined;
  const kickoffDay = Date.parse(`${kickoff.toLocaleDateString('en-CA', opts)}T00:00:00Z`);
  const nowDay = Date.parse(`${now.toLocaleDateString('en-CA', opts)}T00:00:00Z`);
  return Math.round((kickoffDay - nowDay) / 86_400_000);
}

/**
 * Is this kickoff "today" from the venue's point of view?
 */
export function isMatchToday(
  matchDateIso: string,
  venue: string | null | undefined,
  now: Date = new Date(),
): boolean {
  return venueDayOffset(matchDateIso, venue, now) === 0;
}
