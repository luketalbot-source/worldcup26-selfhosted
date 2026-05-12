// Canonical "all teams in the tournament" list for dropdown/picker UIs.
//
// Replaces the old per-component `getUniqueTeams()` helpers that read
// from `src/data/teams.ts` and dedup'd by code. That static list still
// carries six placeholder slots (`UEFA Playoff A/B/C/D`, `FIFA Playoff
// 1/2`) all sharing `code: 'TBD'`. The dedup-by-code filter dropped
// five of them, so the Boost dropdowns silently showed 43 teams
// instead of 48 — even after the actual qualifiers had been filled in
// by the football-data.org sync.
//
// Reading from `live_matches` is canonical for two reasons:
//   1. It's continuously refreshed from the FD sync, so newly
//      qualified teams appear without a code release.
//   2. The admin override editor lets us correct any FD mistake
//      directly in `live_matches`, and that fix flows through here
//      with no extra wiring.
//
// Flag emoji isn't on `live_matches` (no place for it in the schema),
// so we still look that up from the static file via a code→flag map.
// Static is fine for flags — they don't change once a team is named.

import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useLiveMatchesContext } from '@/contexts/LiveMatchesContext';
import { teams as staticTeams } from '@/data/teams';
import type { Team } from '@/types/match';

// Anything matching this is a placeholder, not a real team — exclude
// from pickers. `TBD` is what the API returns for unqualified slots;
// empty string is defence in depth.
const PLACEHOLDER_CODES = new Set(['TBD', '???', '']);

// Tournament-group names must look like 'Group A' .. 'Group L'.
// `live_matches` historically contained dev-seed rows tagged
// group_name='TEST' (with stage='group') that put club teams —
// PSG, Bayern, Arsenal, Atleti — into the team picker. Filtering on
// the canonical naming pattern keeps that kind of accidental seed
// from leaking into UI again without needing a code change.
const TOURNAMENT_GROUP_RE = /^Group [A-L]$/;

// Build the code → flag lookup once on module load. Placeholder codes
// in the static file are skipped so an early `TBD` row's '🏳️' flag
// can't shadow a real team that later gets the same code (extremely
// unlikely given FIFA codes are unique, but cheap to defend against).
const FLAGS_BY_CODE: Record<string, string> = (() => {
  const out: Record<string, string> = {};
  for (const t of staticTeams) {
    if (PLACEHOLDER_CODES.has(t.code)) continue;
    if (!out[t.code]) out[t.code] = t.flag;
  }
  return out;
})();

/**
 * Returns the canonical, sorted-by-name list of qualified teams.
 * Shape matches `Team` from `@/types/match` so consumers can drop it
 * in where they used the static list.
 *
 * `id` is synthesised from the code (lowercased) — most consumers use
 * it only as a React key, and a code-derived id is guaranteed unique
 * within this list (we dedup by code).
 *
 * `group` may be empty string for teams that only appear in non-group
 * matches (shouldn't happen during the WC, but harmless if it does).
 */
export function useQualifiedTeams(): Team[] {
  const { matches } = useLiveMatchesContext();
  // We sort by the *localised* team name so the visible order matches
  // the visible labels. Without this, the picker displays "Kanada" /
  // "Kap Verde" / "Kolumbien" mid-list because they sort by the
  // English fallback ("Canada" / "Cape Verde" / "Colombia") even
  // though the German labels are shown. The translation function is
  // pulled in here so the sort updates immediately on language change
  // without each consumer having to re-sort.
  const { t, i18n } = useTranslation();
  return useMemo(() => {
    const byCode = new Map<string, Team>();

    for (const m of matches) {
      // Group stage rows give us the definitive 48-team picture. Knockout
      // rows often carry placeholder codes ("Winner Group A") until the
      // bracket is determined — including them would re-introduce the
      // exact noise we're trying to avoid.
      if (m.stage !== 'group') continue;
      // Also gate on the group_name shape — see TOURNAMENT_GROUP_RE.
      if (!m.group_name || !TOURNAMENT_GROUP_RE.test(m.group_name)) continue;

      for (const side of ['home', 'away'] as const) {
        const code = side === 'home' ? m.home_team_code : m.away_team_code;
        const name = side === 'home' ? m.home_team_name : m.away_team_name;
        const group = m.group_name ?? '';

        if (!code || !name || PLACEHOLDER_CODES.has(code)) continue;
        if (byCode.has(code)) continue;

        byCode.set(code, {
          id: code.toLowerCase(),
          code,
          name,
          flag: FLAGS_BY_CODE[code] ?? '🏳️',
          group,
        });
      }
    }

    // Sort by the localised name. `t(`teams.${code}`, { defaultValue: '' })`
    // returns '' when there's no translation, in which case fall back to
    // the English `name` from live_matches — same precedence as
    // useTeamName but inlined here so we don't pull a hook into a hook.
    const localiseName = (team: Team): string => {
      const key = `teams.${team.code}`;
      const translated = t(key, { defaultValue: '' });
      return translated && translated !== key ? translated : team.name;
    };
    return [...byCode.values()].sort((a, b) =>
      localiseName(a).localeCompare(localiseName(b), i18n.language),
    );
    // `t` and `i18n.language` in deps so we resort when the user changes
    // language at runtime — the picker reflows alphabetically immediately.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matches, i18n.language]);
}
