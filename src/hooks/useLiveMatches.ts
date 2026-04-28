import { useCallback } from 'react';
import { Match, Team } from '@/types/match';
import { groupStageMatches } from '@/data/matches';
import { getAllKnockoutMatches, KnockoutMatch } from '@/data/knockoutMatches';
import { useTeams, tlaToFlag } from './useTeams';
import { useLiveMatchesContext, type LiveMatch } from '@/contexts/LiveMatchesContext';

// Thin wrapper around <LiveMatchesProvider>'s context. Keeps the public API
// every existing call site already uses (getTodayMatches / getGroupMatches /
// getKnockoutMatches / syncMatches / canSync / cooldownRemaining / etc.) so
// no consumer had to be touched when we lifted state into a provider — but
// gets free SSE-driven updates because the provider owns one EventSource
// for the entire app.
export const useLiveMatches = () => {
  const ctx = useLiveMatchesContext();
  const { getTeamByCode } = useTeams();
  const liveMatches = ctx.matches;

  // Merge live data on top of the static fixture file (used by group stage
  // pre-WC, before the live API is fully populated). Match by either
  // canonical match_id or by team-code pair.
  const mergeWithLocalData = useCallback(
    (localMatches: Match[]): Match[] => {
      return localMatches.map((match) => {
        const liveMatch = liveMatches.find((lm) => {
          if (lm.match_id === match.id) return true;
          const homeMatches = lm.home_team_code === match.homeTeam.code;
          const awayMatches = lm.away_team_code === match.awayTeam.code;
          return homeMatches && awayMatches;
        });
        if (liveMatch) {
          return {
            ...match,
            homeScore: liveMatch.home_score ?? undefined,
            awayScore: liveMatch.away_score ?? undefined,
            status: mapApiStatus(liveMatch.status),
          };
        }
        return match;
      });
    },
    [liveMatches],
  );

  // Today = matches whose kickoff falls on the user's local calendar day.
  // Pulls from `liveMatches` (live API data), not the static fixture file —
  // the static file's dates are all set to the actual tournament window
  // (June 2026), so it'd never include "today" outside the WC itself, and
  // would never reflect a freshly synced live match.
  const getTodayMatches = useCallback((): Match[] => {
    const fallbackTeam = (code: string, name: string, group: string | null): Team => ({
      id: code.toLowerCase(),
      name,
      code,
      // Use tlaToFlag so FLAG_OVERRIDES (e.g. FCB/PSG for the CL test)
      // still applies even when teams cache hasn't seen these codes yet.
      flag: tlaToFlag(code),
      group: group ?? '',
    });

    const todayLocal = new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD
    return liveMatches
      .filter((row) => {
        const matchDayLocal = new Date(row.match_date).toLocaleDateString('en-CA');
        return matchDayLocal === todayLocal;
      })
      .map((row) => {
        const status: Match['status'] =
          row.status === 'IN_PLAY' || row.status === 'PAUSED' || row.status === 'LIVE'
            ? 'live'
            : row.status === 'FINISHED' ||
              row.status === 'FT' ||
              row.status === 'AET' ||
              row.status === 'PEN'
              ? 'finished'
              : 'upcoming';

        const stageMap: Record<string, Match['stage']> = {
          group: 'group',
          round32: 'round32',
          round16: 'round16',
          quarter: 'quarter',
          semi: 'semi',
          third: 'third',
          final: 'final',
        };

        return {
          id: row.match_id,
          homeTeam:
            getTeamByCode(row.home_team_code) ??
            fallbackTeam(row.home_team_code, row.home_team_name, row.group_name),
          awayTeam:
            getTeamByCode(row.away_team_code) ??
            fallbackTeam(row.away_team_code, row.away_team_name, row.group_name),
          date: row.match_date,
          time: '',
          dateIso: row.match_date,
          venue: row.venue ?? '',
          city: row.city ?? '',
          stage: stageMap[row.stage] ?? 'group',
          group: row.group_name ?? undefined,
          homeScore: row.home_score ?? undefined,
          awayScore: row.away_score ?? undefined,
          status,
          goals: row.goals ?? [],
        };
      })
      .sort((a, b) => new Date(a.dateIso!).getTime() - new Date(b.dateIso!).getTime());
  }, [liveMatches, getTeamByCode]);

  const getGroupMatches = useCallback(
    (group: string): Match[] => {
      const localMatches = groupStageMatches.filter((m) => m.group === group);
      return mergeWithLocalData(localMatches);
    },
    [mergeWithLocalData],
  );

  const getKnockoutMatches = useCallback(
    (stage: string): KnockoutMatch[] => {
      const allKnockout = getAllKnockoutMatches();
      const stageMatches = allKnockout.filter((m) => m.stage === stage);

      return stageMatches.map((match) => {
        const liveMatch = liveMatches.find((lm) => {
          if (lm.match_id === match.id) return true;
          return lm.stage === match.stage;
        });

        if (liveMatch) {
          return {
            ...match,
            homeTeam: {
              ...match.homeTeam,
              name: liveMatch.home_team_name || match.homeTeam.name,
              code: liveMatch.home_team_code || match.homeTeam.code,
            },
            awayTeam: {
              ...match.awayTeam,
              name: liveMatch.away_team_name || match.awayTeam.name,
              code: liveMatch.away_team_code || match.awayTeam.code,
            },
            homeScore: liveMatch.home_score ?? undefined,
            awayScore: liveMatch.away_score ?? undefined,
            status: mapApiStatus(liveMatch.status),
          };
        }

        return match;
      });
    },
    [liveMatches],
  );

  return {
    liveMatches,
    loading: ctx.loading,
    lastSync: ctx.lastSync,
    syncing: ctx.syncing,
    syncMatches: ctx.syncMatches,
    canSync: ctx.canSync,
    cooldownRemaining: ctx.cooldownRemaining,
    getGroupMatches,
    getKnockoutMatches,
    getTodayMatches,
    refetch: ctx.refetch,
  };
};

function mapApiStatus(apiStatus: string): 'upcoming' | 'live' | 'finished' {
  switch (apiStatus) {
    case 'FINISHED':
      return 'finished';
    case 'IN_PLAY':
    case 'PAUSED':
    case 'LIVE':
      return 'live';
    case 'SCHEDULED':
    case 'TIMED':
    default:
      return 'upcoming';
  }
}

// Re-export the LiveMatch type so existing callers that imported it from
// here continue to compile.
export type { LiveMatch };
