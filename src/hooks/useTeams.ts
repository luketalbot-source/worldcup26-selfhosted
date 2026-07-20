import { useEffect, useState } from 'react';
import { api } from '@/lib/apiClient';
import type { Team } from '@/types/match';
import { useCompetitionsSafe } from '@/contexts/CompetitionContext';

// API shape — `GET /api/competitions/:slug/teams` (the old /wc2026/teams is
// an alias for slug wc-2026). Populated by the sync job from
// football-data.org, one roster per competition.
interface ApiTeam {
  id: string;
  tla: string;
  name: string;
  short_name: string | null;
  crest_url: string | null;
  group_name: string | null;
}
interface ApiTeamsResponse {
  teams: ApiTeam[];
  groups: Record<string, ApiTeam[]>;
  count: number;
}

// Fallback slug for surfaces without a CompetitionProvider (admin) and for
// the archive era — matches the seeded wc-2026 competitions row.
const DEFAULT_SLUG = 'wc-2026';

// Lightweight emoji flag from TLA. Country TLAs like "MEX" → "🇲🇽" via the
// Regional Indicator Symbol trick (2 unicode chars per ISO-2 letter). FIFA
// TLAs aren't always 2-letter ISO country codes (e.g. ENG, SCO — those are
// IOC-style), so we keep a small override table.
const FLAG_OVERRIDES: Record<string, string> = {
  ENG: '🏴󠁧󠁢󠁥󠁮󠁧󠁿',
  SCO: '🏴󠁧󠁢󠁳󠁣󠁴󠁿',
  WAL: '🏴󠁧󠁢󠁷󠁬󠁳󠁿',
  NIR: '🇬🇧',
};
// Exported so fallback paths (useGroupFixtures' `fallback` Team, etc) can
// render the right flag for codes that haven't yet landed in the teams
// cache. Without this, a freshly-seeded match shows 🏳️ for both sides
// until either the server's 5-min Cache-Control on /wc2026/teams turns
// over OR the user does a hard refresh.
export function tlaToFlag(tla: string): string {
  if (FLAG_OVERRIDES[tla]) return FLAG_OVERRIDES[tla]!;
  const iso2 = TLA_TO_ISO2[tla];
  if (!iso2) return '🏳️';
  const base = 0x1f1e6 - 65;
  return String.fromCodePoint(base + iso2.charCodeAt(0), base + iso2.charCodeAt(1));
}

// FIFA-TLA → ISO 3166-1 alpha-2 map. Used for both emoji and CDN flag URLs.
// Used by tlaToFlag (emoji flags). The flagcdn.com image path that also
// consumed this table was removed June 2026 — match cards now render
// bundled SVGs via <Flag> (src/components/Flag.tsx) instead of CDN PNGs.
export const TLA_TO_ISO2: Record<string, string> = {
  // Americas
  MEX: 'MX', USA: 'US', CAN: 'CA', BRA: 'BR', ARG: 'AR', URU: 'UY', URY: 'UY', PAR: 'PY',
  COL: 'CO', ECU: 'EC', CHI: 'CL', BOL: 'BO', PER: 'PE', VEN: 'VE',
  HAI: 'HT', JAM: 'JM', CRC: 'CR', PAN: 'PA', CUR: 'CW', CUW: 'CW', // FD renamed CUR→CUW (and URU→URY) June 2026; keep both
  // Europe
  GER: 'DE', FRA: 'FR', ESP: 'ES', POR: 'PT', ITA: 'IT', NED: 'NL', BEL: 'BE',
  SUI: 'CH', AUT: 'AT', DEN: 'DK', SWE: 'SE', NOR: 'NO', FIN: 'FI', ISL: 'IS',
  POL: 'PL', CZE: 'CZ', SVK: 'SK', HUN: 'HU', SVN: 'SI', CRO: 'HR', BIH: 'BA',
  SRB: 'RS', MNE: 'ME', MKD: 'MK', ALB: 'AL', KOS: 'XK', BUL: 'BG', ROU: 'RO',
  GRE: 'GR', TUR: 'TR', UKR: 'UA', RUS: 'RU', IRL: 'IE',
  // Africa
  MAR: 'MA', EGY: 'EG', TUN: 'TN', ALG: 'DZ', CIV: 'CI', GHA: 'GH', SEN: 'SN',
  CMR: 'CM', NGA: 'NG', RSA: 'ZA', CPV: 'CV', COD: 'CD', ANG: 'AO', MLI: 'ML',
  BFA: 'BF', ZAM: 'ZM', ZIM: 'ZW', KEN: 'KE', UGA: 'UG', TAN: 'TZ', ETH: 'ET',
  SUD: 'SD', LBY: 'LY',
  // Asia / Oceania / Middle East
  JPN: 'JP', KOR: 'KR', PRK: 'KP', CHN: 'CN', AUS: 'AU', NZL: 'NZ',
  QAT: 'QA', KSA: 'SA', UAE: 'AE', IRN: 'IR', IRQ: 'IQ', JOR: 'JO', LBN: 'LB',
  SYR: 'SY', ISR: 'IL', YEM: 'YE', OMA: 'OM', KUW: 'KW', BHR: 'BH',
  UZB: 'UZ', TKM: 'TM', KAZ: 'KZ', KGZ: 'KG', TJK: 'TJ',
  THA: 'TH', VIE: 'VN', IDN: 'ID', MAS: 'MY', SIN: 'SG', PHI: 'PH',
  IND: 'IN', PAK: 'PK', BAN: 'BD', NEP: 'NP', SRI: 'LK',
};

function toAppTeam(t: ApiTeam): Team {
  return {
    id: t.tla.toLowerCase(),
    name: t.name,
    code: t.tla,
    flag: tlaToFlag(t.tla),
    group: t.group_name ?? '',
    crestUrl: t.crest_url,
    shortName: t.short_name,
  };
}

// -----------------------------------------------------------------------------
// Module-scope state + de-duped loader, keyed PER COMPETITION.
// Multiple hook mounts (GroupTabs, GroupStandings, MatchCard) all want the
// same roster — sharing the in-flight promise avoids redundant fetches
// during a single render cycle.
// -----------------------------------------------------------------------------

type TeamsCache = { teams: Team[]; groups: Record<string, Team[]> };

const cacheBySlug = new Map<string, TeamsCache>();
const inflightBySlug = new Map<string, Promise<TeamsCache>>();

async function load(slug: string): Promise<TeamsCache> {
  let resp: ApiTeamsResponse;
  try {
    resp = await api.get<ApiTeamsResponse>(`/competitions/${encodeURIComponent(slug)}/teams`);
  } catch (err) {
    // Deploy-skew fallback: an old API (no competitions route yet) still
    // serves the WC roster on the legacy path. Only meaningful for the
    // archive slug — other competitions don't exist on an old API anyway.
    if (slug === DEFAULT_SLUG) {
      resp = await api.get<ApiTeamsResponse>('/wc2026/teams');
    } else {
      throw err;
    }
  }
  const teams = (resp?.teams ?? []).map(toAppTeam);
  const groups: Record<string, Team[]> = {};
  for (const t of teams) {
    if (!t.group) continue;
    (groups[t.group] ??= []).push(t);
  }
  return { teams, groups };
}

async function ensureLoad(slug: string, force = false): Promise<TeamsCache> {
  if (force) {
    cacheBySlug.delete(slug);
    inflightBySlug.delete(slug);
  }
  const cached = cacheBySlug.get(slug);
  if (cached) return cached;
  let inflight = inflightBySlug.get(slug);
  if (!inflight) {
    inflight = load(slug)
      .then((result) => {
        cacheBySlug.set(slug, result);
        return result;
      })
      .finally(() => {
        inflightBySlug.delete(slug);
      });
    inflightBySlug.set(slug, inflight);
  }
  return inflight;
}

/**
 * Team roster for the ACTIVE competition (or an explicit slug). Populated
 * by the backend's sync job; auto-fetched on mount with a 3s poll while the
 * list is empty so the page self-populates when the backend's own auto-sync
 * finishes in the background.
 */
export const useTeams = (competitionSlug?: string) => {
  const ctx = useCompetitionsSafe();
  const slug = competitionSlug ?? ctx?.activeCompetition?.slug ?? DEFAULT_SLUG;
  const [data, setData] = useState<TeamsCache | null>(cacheBySlug.get(slug) ?? null);

  useEffect(() => {
    let cancelled = false;

    // Reset to whatever's cached for the (possibly new) slug, then load.
    setData(cacheBySlug.get(slug) ?? null);
    ensureLoad(slug).then((d) => {
      if (!cancelled) setData(d);
    }).catch(() => {
      // keep data as-is; polling below will retry
    });

    return () => { cancelled = true; };
  }, [slug]);

  // Retry every 3s while the roster is empty (backend is probably mid-sync).
  // Cancellation-guarded: a response landing after the user switched
  // competitions must not install the OLD roster under the new slug's view.
  useEffect(() => {
    if (data && data.teams.length > 0) return;
    let cancelled = false;
    const id = setInterval(() => {
      ensureLoad(slug, true)
        .then((d) => {
          if (!cancelled) setData(d);
        })
        .catch(() => { /* ignore */ });
    }, 3000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [data, slug]);

  const getTeamByCode = (code: string): Team | undefined =>
    data?.teams.find((t) => t.code === code.toUpperCase());

  const getTeamById = (id: string): Team | undefined =>
    data?.teams.find((t) => t.id === id.toLowerCase());

  const getTeamsByGroup = (group: string): Team[] =>
    data?.groups[group] ?? [];

  return {
    teams: data?.teams ?? [],
    groups: data?.groups ?? {},
    loading: !data,
    getTeamByCode,
    getTeamById,
    getTeamsByGroup,
  };
};
