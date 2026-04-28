import { useEffect, useState } from 'react';
import { api } from '@/lib/apiClient';
import type { Team } from '@/types/match';

// API shape — `GET /api/wc2026/teams`. Populated by the admin sync-matches
// job from football-data.org.
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

// Lightweight emoji flag from TLA. Country TLAs like "MEX" → "🇲🇽" via the
// Regional Indicator Symbol trick (2 unicode chars per ISO-2 letter). FIFA
// TLAs aren't always 2-letter ISO country codes (e.g. ENG, SCO — those are
// IOC-style), so we keep a small override table.
const FLAG_OVERRIDES: Record<string, string> = {
  ENG: '🏴󠁧󠁢󠁥󠁮󠁧󠁿',
  SCO: '🏴󠁧󠁢󠁳󠁣󠁴󠁿',
  WAL: '🏴󠁧󠁢󠁷󠁬󠁳󠁿',
  NIR: '🇬🇧',
  // Test injection: Bayern vs PSG UCL semi for live-score rehearsal. The
  // app expects nation TLAs, so we render the club's country flag instead
  // of the badge — Bayern (Germany), PSG (France). Remove with the rest
  // of the CL test scaffolding once the WC opens.
  FCB: '🇩🇪',
  PSG: '🇫🇷',
};
function tlaToFlag(tla: string): string {
  if (FLAG_OVERRIDES[tla]) return FLAG_OVERRIDES[tla]!;
  const iso2 = TLA_TO_ISO2[tla];
  if (!iso2) return '🏳️';
  const base = 0x1f1e6 - 65;
  return String.fromCodePoint(base + iso2.charCodeAt(0), base + iso2.charCodeAt(1));
}

// FIFA-TLA → ISO 3166-1 alpha-2 map. Used for both emoji and CDN flag URLs.
// Exported so flagUtils.ts can stay in sync with a single source of truth.
export const TLA_TO_ISO2: Record<string, string> = {
  // Americas
  MEX: 'MX', USA: 'US', CAN: 'CA', BRA: 'BR', ARG: 'AR', URU: 'UY', PAR: 'PY',
  COL: 'CO', ECU: 'EC', CHI: 'CL', BOL: 'BO', PER: 'PE', VEN: 'VE',
  HAI: 'HT', JAM: 'JM', CRC: 'CR', PAN: 'PA', CUR: 'CW', // CUR is FD's TLA for Curaçao
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
  };
}

// -----------------------------------------------------------------------------
// Module-scope state + de-duped loader.
// Multiple hook mounts (GroupTabs, GroupStandings, MatchCard) all want the
// same roster — sharing the in-flight promise avoids redundant fetches
// during a single render cycle.
// -----------------------------------------------------------------------------

type TeamsCache = { teams: Team[]; groups: Record<string, Team[]> };

let cache: TeamsCache | null = null;
let inflight: Promise<TeamsCache> | null = null;

async function load(): Promise<TeamsCache> {
  const resp = await api.get<ApiTeamsResponse>('/wc2026/teams');
  const teams = (resp?.teams ?? []).map(toAppTeam);
  const groups: Record<string, Team[]> = {};
  for (const t of teams) {
    if (!t.group) continue;
    (groups[t.group] ??= []).push(t);
  }
  return { teams, groups };
}

async function ensureLoad(force = false): Promise<TeamsCache> {
  if (force) {
    cache = null;
    inflight = null;
  }
  if (cache) return cache;
  if (!inflight) {
    inflight = load()
      .then((result) => {
        cache = result;
        return result;
      })
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
}

/**
 * FIFA World Cup 2026 team roster. Populated by the backend's sync-matches
 * job; auto-fetched on mount with a 3s poll while the list is empty so the
 * page self-populates when the backend's own auto-sync finishes in the
 * background.
 */
export const useTeams = () => {
  const [data, setData] = useState<TeamsCache | null>(cache);

  useEffect(() => {
    let cancelled = false;

    // First load (or reuse cache if already warm).
    ensureLoad().then((d) => {
      if (!cancelled) setData(d);
    }).catch(() => {
      // keep data as-is; polling below will retry
    });

    return () => { cancelled = true; };
  }, []);

  // Retry every 3s while the roster is empty (backend is probably mid-sync).
  useEffect(() => {
    if (data && data.teams.length > 0) return;
    const id = setInterval(() => {
      ensureLoad(true).then(setData).catch(() => { /* ignore */ });
    }, 3000);
    return () => clearInterval(id);
  }, [data]);

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
