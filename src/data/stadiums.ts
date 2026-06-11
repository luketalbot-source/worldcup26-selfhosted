// The 16 WC2026 host stadiums — single source of truth for everything
// venue-derived: timezone grouping (lib/venueTimezones.ts derives its
// table from here), and the stadium info card (capacity, photo,
// description). All static: the venue list is fixed for the tournament,
// so no API involved.
//
// `patterns` match against football-data.org's venue strings, which are
// unstable — FD shipped "Azteca" and "AKRON" where fixtures said
// "Estadio Azteca"/"Estadio Akron", and renames things mid-tournament
// (same week they renamed two team TLAs). Substring regexes survive
// that churn. `cityPatterns` are the fallback for knockout fixtures
// that carry compound "Venue / City" strings or city-only data.
//
// Photos: vendored to public/stadiums/<slug>.jpg from Wikimedia Commons
// (fetched 2026-06-11, ~800px, ~1.9 MB total) — same self-hosting
// pattern as the team flags, so no third-party host for corporate
// proxies to block. They lazy-load only when a card opens. CC licenses
// require the credit line, rendered as a caption in the card.
//
// Descriptions live in i18n under `stadium.descriptions.<slug>`
// (EN + DE; other locales fall back to EN per-key).

export interface Stadium {
  slug: string;
  name: string;
  city: string;
  /** ISO country code — label translated via i18n `stadium.country.<code>` */
  country: 'US' | 'MX' | 'CA';
  capacity: number;
  opened: number;
  /** IANA timezone — consumed by lib/venueTimezones.ts */
  tz: string;
  patterns: RegExp[];
  cityPatterns: RegExp[];
  image: string;
  photoCredit: string;
}

export const STADIUMS: Stadium[] = [
  // ── Mexico (no DST since 2022 — CST year-round) ──
  {
    slug: 'azteca',
    name: 'Estadio Azteca',
    city: 'Mexico City',
    country: 'MX',
    capacity: 87523,
    opened: 1966,
    tz: 'America/Mexico_City',
    patterns: [/azteca/i],
    cityPatterns: [/mexico city/i, /ciudad de m[eé]xico/i],
    image: '/stadiums/azteca.jpg',
    photoCredit: 'Carlos Valenzuela · CC BY-SA 4.0',
  },
  {
    slug: 'akron',
    name: 'Estadio Akron',
    city: 'Guadalajara',
    country: 'MX',
    capacity: 49850,
    opened: 2010,
    tz: 'America/Mexico_City',
    patterns: [/akron/i, /omnilife/i],
    cityPatterns: [/guadalajara/i, /zapopan/i],
    image: '/stadiums/akron.jpg',
    photoCredit: 'Juan Olivas · CC BY 2.0',
  },
  {
    slug: 'bbva',
    name: 'Estadio BBVA',
    city: 'Monterrey',
    country: 'MX',
    capacity: 53500,
    opened: 2015,
    tz: 'America/Monterrey',
    patterns: [/bbva/i],
    cityPatterns: [/monterrey/i, /guadalupe/i],
    image: '/stadiums/bbva.jpg',
    photoCredit: 'Presidencia de la República Mexicana · CC BY 2.0',
  },

  // ── US East ──
  {
    slug: 'metlife',
    name: 'MetLife Stadium',
    city: 'New York / New Jersey',
    country: 'US',
    capacity: 82500,
    opened: 2010,
    tz: 'America/New_York',
    patterns: [/metlife/i],
    cityPatterns: [/new york/i, /new jersey/i, /east rutherford/i],
    image: '/stadiums/metlife.jpg',
    photoCredit: 'Thecoolone1223 · CC BY 4.0',
  },
  {
    slug: 'gillette',
    name: 'Gillette Stadium',
    city: 'Boston',
    country: 'US',
    capacity: 65878,
    opened: 2002,
    tz: 'America/New_York',
    patterns: [/gillette/i],
    cityPatterns: [/boston/i, /foxborough/i],
    image: '/stadiums/gillette.jpg',
    photoCredit: 'Bernard Gagnon · CC BY-SA 3.0',
  },
  {
    slug: 'lincoln',
    name: 'Lincoln Financial Field',
    city: 'Philadelphia',
    country: 'US',
    capacity: 69796,
    opened: 2003,
    tz: 'America/New_York',
    patterns: [/lincoln financial/i],
    cityPatterns: [/philadelphia/i],
    image: '/stadiums/lincoln.jpg',
    photoCredit: 'Betp (French Wikipedia) · CC BY-SA 3.0',
  },
  {
    slug: 'mercedes',
    name: 'Mercedes-Benz Stadium',
    city: 'Atlanta',
    country: 'US',
    capacity: 71000,
    opened: 2017,
    tz: 'America/New_York',
    patterns: [/mercedes[- ]benz/i],
    cityPatterns: [/atlanta/i],
    image: '/stadiums/mercedes.jpg',
    photoCredit: 'Atlanta Falcons · CC BY 3.0',
  },
  {
    slug: 'hardrock',
    name: 'Hard Rock Stadium',
    city: 'Miami',
    country: 'US',
    capacity: 65326,
    opened: 1987,
    tz: 'America/New_York',
    patterns: [/hard rock/i],
    cityPatterns: [/miami/i],
    image: '/stadiums/hardrock.jpg',
    photoCredit: 'Elbert Hampton · CC0',
  },

  // ── US Central ──
  {
    slug: 'att',
    name: 'AT&T Stadium',
    city: 'Dallas',
    country: 'US',
    capacity: 80000,
    opened: 2009,
    tz: 'America/Chicago',
    patterns: [/at&t/i, /att stadium/i],
    cityPatterns: [/dallas/i, /arlington/i],
    image: '/stadiums/att.jpg',
    photoCredit: 'Michael Barera · CC BY-SA 4.0',
  },
  {
    slug: 'nrg',
    name: 'NRG Stadium',
    city: 'Houston',
    country: 'US',
    capacity: 72220,
    opened: 2002,
    tz: 'America/Chicago',
    patterns: [/nrg/i],
    cityPatterns: [/houston/i],
    image: '/stadiums/nrg.jpg',
    photoCredit: 'VOA News, B. Allen · Public domain',
  },
  {
    slug: 'arrowhead',
    name: 'Arrowhead Stadium',
    city: 'Kansas City',
    country: 'US',
    capacity: 76416,
    opened: 1972,
    tz: 'America/Chicago',
    patterns: [/arrowhead/i, /geha field/i],
    cityPatterns: [/kansas city/i],
    image: '/stadiums/arrowhead.jpg',
    photoCredit: 'Conman33 · CC BY-SA 4.0',
  },

  // ── US Pacific ──
  {
    slug: 'sofi',
    name: 'SoFi Stadium',
    city: 'Los Angeles',
    country: 'US',
    capacity: 70240,
    opened: 2020,
    tz: 'America/Los_Angeles',
    patterns: [/sofi/i],
    cityPatterns: [/los angeles/i, /inglewood/i],
    image: '/stadiums/sofi.jpg',
    photoCredit: 'Prayitno · CC BY 2.0',
  },
  {
    slug: 'levis',
    name: "Levi's Stadium",
    city: 'San Francisco Bay Area',
    country: 'US',
    capacity: 68500,
    opened: 2014,
    tz: 'America/Los_Angeles',
    patterns: [/levi/i],
    cityPatterns: [/san francisco/i, /santa clara/i],
    image: '/stadiums/levis.jpg',
    photoCredit: 'Matthew Roth · CC BY-SA 2.0',
  },
  {
    slug: 'lumen',
    name: 'Lumen Field',
    city: 'Seattle',
    country: 'US',
    capacity: 68740,
    opened: 2002,
    tz: 'America/Los_Angeles',
    patterns: [/lumen/i, /qwest/i],
    cityPatterns: [/seattle/i],
    image: '/stadiums/lumen.jpg',
    photoCredit: 'Smart Destinations · CC BY-SA 2.0',
  },

  // ── Canada ──
  {
    slug: 'bmo',
    name: 'BMO Field',
    city: 'Toronto',
    country: 'CA',
    capacity: 45736,
    opened: 2007,
    tz: 'America/Toronto',
    patterns: [/bmo field/i, /bmo/i],
    cityPatterns: [/toronto/i],
    image: '/stadiums/bmo.jpg',
    photoCredit: 'Wladyslaw · CC BY-SA 3.0',
  },
  {
    slug: 'bcplace',
    name: 'BC Place',
    city: 'Vancouver',
    country: 'CA',
    capacity: 54500,
    opened: 1983,
    tz: 'America/Vancouver',
    patterns: [/bc place/i],
    cityPatterns: [/vancouver/i],
    image: '/stadiums/bcplace.jpg',
    photoCredit: 'Yvrphoto · CC BY-SA 3.0',
  },
];

/**
 * Resolve a stadium from football-data.org's venue/city strings.
 * Venue patterns win; city is the fallback (knockout fixtures carry
 * compound "SoFi Stadium / Los Angeles" strings, and some rows have a
 * city but a renamed venue). Returns null for unknown/TBD — callers
 * must degrade gracefully (inert badge, no popup).
 */
export function findStadium(
  venue: string | null | undefined,
  city?: string | null,
): Stadium | null {
  if (venue) {
    for (const s of STADIUMS) {
      if (s.patterns.some((p) => p.test(venue))) return s;
    }
    // Compound or city-flavoured venue strings ("Stadium X / Seattle").
    for (const s of STADIUMS) {
      if (s.cityPatterns.some((p) => p.test(venue))) return s;
    }
  }
  if (city) {
    for (const s of STADIUMS) {
      if (s.cityPatterns.some((p) => p.test(city))) return s;
    }
  }
  return null;
}
