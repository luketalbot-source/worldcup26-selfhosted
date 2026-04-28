import { useCallback, useMemo } from 'react';
import type { Match, Team } from '@/types/match';
import { useTeams, tlaToFlag } from './useTeams';
import { useLiveMatchesContext, type LiveMatch } from '@/contexts/LiveMatchesContext';

/**
 * Convert FD-style status strings to the UI's simpler enum.
 * FD uses: TIMED, SCHEDULED, IN_PLAY, PAUSED, FINISHED, SUSPENDED, POSTPONED, CANCELLED.
 */
function mapStatus(s: string): Match['status'] {
  switch (s) {
    case 'IN_PLAY':
    case 'PAUSED':
    case 'LIVE':
      return 'live';
    case 'FINISHED':
      return 'finished';
    default:
      return 'upcoming';
  }
}

function toMatch(row: LiveMatch, getTeam: (code: string) => Team | undefined): Match {
  // Fallback team when the roster hasn't been synced yet or the TLA doesn't
  // match (rare — FD is usually consistent). Keeps the UI rendering instead
  // of blowing up. Run the code through tlaToFlag so the FLAG_OVERRIDES
  // table (e.g. FCB → 🇩🇪, PSG → 🇫🇷) still applies even when the team is
  // missing from the cached roster.
  const fallback = (code: string, name: string): Team => ({
    id: code.toLowerCase(),
    name,
    code,
    flag: tlaToFlag(code),
    group: row.group_name ?? '',
  });
  return {
    id: row.match_id,
    homeTeam: getTeam(row.home_team_code) ?? fallback(row.home_team_code, row.home_team_name),
    awayTeam: getTeam(row.away_team_code) ?? fallback(row.away_team_code, row.away_team_name),
    date: row.match_date,
    time: '',
    dateIso: row.match_date,
    venue: row.venue ?? '',
    city: row.city ?? '',
    stage: 'group',
    group: row.group_name ?? undefined,
    homeScore: row.home_score ?? undefined,
    awayScore: row.away_score ?? undefined,
    status: mapStatus(row.status),
    goals: row.goals ?? [],
  };
}

/**
 * Group-stage fixtures, live from the shared LiveMatchesProvider context.
 * Reads through the provider so the SSE-driven score updates flow through
 * automatically — the previous implementation owned its own fetch and so
 * never saw push updates after mount.
 */
export const useGroupFixtures = () => {
  const { getTeamByCode } = useTeams();
  const { matches: rows, loading, refetch } = useLiveMatchesContext();

  const groupRows = useMemo(() => rows.filter((r) => r.stage === 'group'), [rows]);

  const matches = useMemo<Match[]>(
    () => groupRows.map((r) => toMatch(r, getTeamByCode)),
    [groupRows, getTeamByCode],
  );

  const getMatchesByGroup = useCallback(
    (group: string): Match[] => matches.filter((m) => m.group === group),
    [matches],
  );

  return { matches, loading, error: null, refetch, getMatchesByGroup };
};
