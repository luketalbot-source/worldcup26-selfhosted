import { useEffect, useState, useCallback } from 'react';
import { api } from '@/lib/apiClient';
import type { Match, Team } from '@/types/match';
import { useTeams } from './useTeams';

// API row — `GET /api/matches?stage=group`. One-for-one with the
// live_matches table the sync-matches job populates.
interface ApiMatch {
  match_id: string;
  api_match_id: number | null;
  home_team_name: string;
  home_team_code: string;
  away_team_name: string;
  away_team_code: string;
  home_score: number | null;
  away_score: number | null;
  match_date: string; // ISO UTC
  venue: string | null;
  city: string | null;
  stage: string;
  group_name: string | null;
  status: string;
}

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

function toMatch(row: ApiMatch, getTeam: (code: string) => Team | undefined): Match {
  // Fallback team when the roster hasn't been synced yet or the TLA doesn't
  // match (rare — FD is usually consistent). Keeps the UI rendering instead
  // of blowing up.
  const fallback = (code: string, name: string): Team => ({
    id: code.toLowerCase(),
    name,
    code,
    flag: '🏳️',
    group: row.group_name ?? '',
  });
  return {
    id: row.match_id,
    homeTeam: getTeam(row.home_team_code) ?? fallback(row.home_team_code, row.home_team_name),
    awayTeam: getTeam(row.away_team_code) ?? fallback(row.away_team_code, row.away_team_name),
    date: row.match_date,       // Filled with ISO for legacy callers that haven't switched to dateIso yet.
    time: '',                   // Legacy field unused when dateIso is present.
    dateIso: row.match_date,
    venue: row.venue ?? '',
    city: row.city ?? '',
    stage: 'group',
    group: row.group_name ?? undefined,
    homeScore: row.home_score ?? undefined,
    awayScore: row.away_score ?? undefined,
    status: mapStatus(row.status),
  };
}

/**
 * Group-stage fixtures, live from the DB. Matches are shared across users;
 * one fetch per mount is fine — no per-tenant filtering, no pagination.
 * Refresh by calling refetch() (used after the admin runs sync-matches).
 */
export const useGroupFixtures = () => {
  const { getTeamByCode, loading: teamsLoading } = useTeams();
  const [matches, setMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const rows = await api.get<ApiMatch[]>('/matches', { stage: 'group' });
      const converted = (rows ?? []).map((r) => toMatch(r, getTeamByCode));
      setMatches(converted);
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setLoading(false);
    }
  }, [getTeamByCode]);

  // Fetch once teams have landed, so getTeamByCode returns real Team objects
  // rather than the placeholder fallback.
  useEffect(() => {
    if (!teamsLoading) void fetch();
  }, [teamsLoading, fetch]);

  const getMatchesByGroup = useCallback(
    (group: string): Match[] => matches.filter((m) => m.group === group),
    [matches]
  );

  return { matches, loading: loading || teamsLoading, error, refetch: fetch, getMatchesByGroup };
};
