import { useEffect, useState, useCallback, useMemo } from 'react';
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
  const { getTeamByCode } = useTeams();
  const [rows, setRows] = useState<ApiMatch[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  // Fetch matches in parallel with /wc2026/teams. The team lookup is just a
  // best-effort enrichment — toMatch falls back to a placeholder Team built
  // from the API row's TLA + name when teams haven't landed yet, and once
  // useTeams resolves the next render picks up the real Team objects via
  // getTeamByCode below.
  const fetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.get<ApiMatch[]>('/matches', { stage: 'group' });
      setRows(data ?? []);
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void fetch(); }, [fetch]);

  // Re-derive Match objects whenever the team roster updates, so flags +
  // proper Team metadata appear without a second network round-trip.
  const matches = useMemo<Match[]>(
    () => (rows ?? []).map((r) => toMatch(r, getTeamByCode)),
    [rows, getTeamByCode]
  );

  const getMatchesByGroup = useCallback(
    (group: string): Match[] => matches.filter((m) => m.group === group),
    [matches]
  );

  return { matches, loading, error, refetch: fetch, getMatchesByGroup };
};
