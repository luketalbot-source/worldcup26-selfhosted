import { useEffect, useState, useMemo, useCallback } from 'react';
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
};
function tlaToFlag(tla: string): string {
  if (FLAG_OVERRIDES[tla]) return FLAG_OVERRIDES[tla]!;
  // Map TLA to 2-letter ISO where we can. FIFA uses mostly ISO-3, and
  // unicode flag emojis only work with ISO-2. We accept a rough mapping of
  // common ones; for everything else fall back to a white flag.
  const iso2: Record<string, string> = {
    MEX: 'MX', USA: 'US', CAN: 'CA', BRA: 'BR', ARG: 'AR', GER: 'DE', FRA: 'FR',
    ESP: 'ES', POR: 'PT', NED: 'NL', BEL: 'BE', ITA: 'IT', CRO: 'HR', URU: 'UY',
    COL: 'CO', JPN: 'JP', KOR: 'KR', AUS: 'AU', QAT: 'QA', SUI: 'CH', DEN: 'DK',
    SWE: 'SE', NOR: 'NO', AUT: 'AT', CZE: 'CZ', TUR: 'TR', POL: 'PL', UKR: 'UA',
    RUS: 'RU', IRN: 'IR', IRQ: 'IQ', KSA: 'SA', JOR: 'JO', EGY: 'EG', MAR: 'MA',
    ALG: 'DZ', TUN: 'TN', SEN: 'SN', CIV: 'CI', GHA: 'GH', CPV: 'CV', RSA: 'ZA',
    PAR: 'PY', ECU: 'EC', CUR: 'CW', HAI: 'HT', CRC: 'CR', PAN: 'PA', NZL: 'NZ',
    JAM: 'JM', VEN: 'VE', PER: 'PE', BOL: 'BO', CHI: 'CL', SCO: 'GB', ENG: 'GB',
    WAL: 'GB', NIR: 'GB', IRL: 'IE', HUN: 'HU', SVK: 'SK', SVN: 'SI', SRB: 'RS',
    ROU: 'RO', BUL: 'BG', GRE: 'GR', BIH: 'BA', MKD: 'MK', ALB: 'AL', MNE: 'ME',
    KOS: 'XK', ISR: 'IL', UAE: 'AE', YEM: 'YE', OMA: 'OM', KUW: 'KW', LBN: 'LB',
    SYR: 'SY', UZB: 'UZ', TKM: 'TM', KAZ: 'KZ', KGZ: 'KG', TJK: 'TJ', CHN: 'CN',
    THA: 'TH', VIE: 'VN', IDN: 'ID', MAS: 'MY', SIN: 'SG', PHI: 'PH', NEP: 'NP',
    BAN: 'BD', PAK: 'PK', IND: 'IN', SRI: 'LK', COD: 'CD', CMR: 'CM', NGA: 'NG',
    ANG: 'AO', MLI: 'ML', BFA: 'BF', ZAM: 'ZM', ZIM: 'ZW', KEN: 'KE', UGA: 'UG',
    TAN: 'TZ', ETH: 'ET', SUD: 'SD', LBY: 'LY',
  };
  const code = iso2[tla];
  if (!code) return '🏳️';
  const base = 0x1f1e6 - 65; // regional indicator 'A'
  return String.fromCodePoint(base + code.charCodeAt(0), base + code.charCodeAt(1));
}

function toAppTeam(t: ApiTeam): Team {
  return {
    id: t.tla.toLowerCase(),
    name: t.name,
    code: t.tla,
    flag: tlaToFlag(t.tla),
    group: t.group_name ?? '',
  };
}

// Module-scope cache. Mounts multiple (GroupTabs, GroupStandings, MatchCard)
// all want the same data; sharing avoids redundant requests during a render.
let cache: { teams: Team[]; groups: Record<string, Team[]> } | null = null;
let inflight: Promise<void> | null = null;

async function load(): Promise<void> {
  if (cache) return;
  if (inflight) return inflight;
  inflight = (async () => {
    const resp = await api.get<ApiTeamsResponse>('/wc2026/teams');
    const teams = (resp?.teams ?? []).map(toAppTeam);
    const groups: Record<string, Team[]> = {};
    for (const t of teams) {
      if (!t.group) continue;
      if (!groups[t.group]) groups[t.group] = [];
      groups[t.group]!.push(t);
    }
    cache = { teams, groups };
  })();
  try {
    await inflight;
  } finally {
    inflight = null;
  }
}

/**
 * FIFA World Cup 2026 team roster, served by the API and populated by
 * sync-matches from football-data.org. Same shape as the legacy
 * static teams.ts so consumer components don't need to change type-wise.
 *
 * The backend's GET /api/wc2026/teams route fires a background sync
 * automatically when the table is empty or stale, so a first page load on
 * a fresh DB will eventually get populated without any admin intervention.
 * This hook polls every 3s while the roster is empty to pick that up.
 */
export const useTeams = () => {
  const [, force] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let pollTimer: ReturnType<typeof setInterval> | null = null;

    const fetchOnce = async () => {
      // Reset cache on each poll so load() re-runs.
      cache = null;
      try { await load(); } catch { /* keep polling */ }
      if (!cancelled) force((n) => n + 1);
    };

    if (!cache) {
      void load().then(() => {
        if (cancelled) return;
        force((n) => n + 1);
        // If the initial load came back empty, poll every 3s until populated
        // — the backend is running a background sync in the meantime.
        if (cache && cache.teams.length === 0) {
          pollTimer = setInterval(async () => {
            await fetchOnce();
            if (cache && cache.teams.length > 0 && pollTimer) {
              clearInterval(pollTimer);
              pollTimer = null;
            }
          }, 3000);
        }
      });
    }
    return () => {
      cancelled = true;
      if (pollTimer) clearInterval(pollTimer);
    };
  }, []);

  const getTeamByCode = useCallback((code: string): Team | undefined => {
    if (!cache) return undefined;
    const normalised = code.toUpperCase();
    return cache.teams.find((t) => t.code === normalised);
  }, []);

  const getTeamById = useCallback((id: string): Team | undefined => {
    if (!cache) return undefined;
    const normalised = id.toLowerCase();
    return cache.teams.find((t) => t.id === normalised);
  }, []);

  const getTeamsByGroup = useCallback((group: string): Team[] => {
    return cache?.groups[group] ?? [];
  }, []);

  return useMemo(
    () => ({
      teams: cache?.teams ?? [],
      groups: cache?.groups ?? {},
      loading: cache === null,
      getTeamByCode,
      getTeamById,
      getTeamsByGroup,
    }),
    [getTeamByCode, getTeamById, getTeamsByGroup]
  );
};
