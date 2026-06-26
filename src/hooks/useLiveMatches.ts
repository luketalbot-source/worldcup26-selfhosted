import { useCallback } from 'react';
import { Match, Team } from '@/types/match';
import { groupStageMatches } from '@/data/matches';
import { getAllKnockoutMatches, KnockoutMatch } from '@/data/knockoutMatches';
import { useTeams, tlaToFlag } from './useTeams';
import { useLiveMatchesContext, type LiveMatch } from '@/contexts/LiveMatchesContext';
import { venueDayOffset } from '@/lib/venueTimezones';

// Day filters for the Today tab (BBC-style): each is a window over the
// venue-local day offset. 'today' is the default; 'past'/'future' are
// open-ended catch-alls beyond the adjacent days.
export type MatchDayFilter = 'past' | 'yesterday' | 'today' | 'tomorrow' | 'future';

const DAY_FILTER_MATCHES: Record<MatchDayFilter, (offset: number) => boolean> = {
  past: (o) => o <= -2,
  yesterday: (o) => o === -1,
  today: (o) => o === 0,
  tomorrow: (o) => o === 1,
  future: (o) => o >= 2,
};

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
            // PSO + duration: undefined for unplayed / regulation
            // matches so the badge code can early-return cleanly.
            penaltyHomeScore: liveMatch.penalty_home_score ?? undefined,
            penaltyAwayScore: liveMatch.penalty_away_score ?? undefined,
            duration: liveMatch.duration ?? undefined,
            status: mapApiStatus(liveMatch.status),
          };
        }
        return match;
      });
    },
    [liveMatches],
  );

  // Today = matches whose kickoff falls on the current calendar day AT
  // THE VENUE (not the user's day). A 20:00 ET kickoff in New Jersey is
  // 02:00 next-day in Germany — under user-local grouping European users
  // watched tonight's late games vanish from the Today tab while the
  // official schedule still called them today's matches. Kickoff times
  // shown on the cards remain in the user's timezone (useMatchTime).
  // Pulls from `liveMatches` (live API data), not the static fixture file —
  // the static file's dates are all set to the actual tournament window
  // (June 2026), so it'd never include "today" outside the WC itself, and
  // would never reflect a freshly synced live match.
  const getTodayMatches = useCallback((filter: MatchDayFilter = 'today'): Match[] => {
    const fallbackTeam = (code: string, name: string, group: string | null): Team => ({
      id: code.toLowerCase(),
      name,
      code,
      // Use tlaToFlag so FLAG_OVERRIDES (e.g. FCB/PSG for the CL test)
      // still applies even when teams cache hasn't seen these codes yet.
      flag: tlaToFlag(code),
      group: group ?? '',
    });

    const inWindow = DAY_FILTER_MATCHES[filter];
    return liveMatches
      .filter((row) => {
        const offset = venueDayOffset(row.match_date, row.venue);
        return offset !== null && inWindow(offset);
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
          penaltyHomeScore: row.penalty_home_score ?? undefined,
          penaltyAwayScore: row.penalty_away_score ?? undefined,
          duration: row.duration ?? undefined,
          status,
          goals: row.goals ?? [],
          bookings: row.bookings ?? [],
        };
      })
      .sort((a, b) => {
        const diff = new Date(a.dateIso!).getTime() - new Date(b.dateIso!).getTime();
        // Past reads newest-first (you're looking for last night's
        // results); every forward-looking window reads oldest-first.
        return filter === 'past' ? -diff : diff;
      });
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
            penaltyHomeScore: liveMatch.penalty_home_score ?? undefined,
            penaltyAwayScore: liveMatch.penalty_away_score ?? undefined,
            duration: liveMatch.duration ?? undefined,
            status: mapApiStatus(liveMatch.status),
            // Goal scorers + bookings, same as the group path — drives
            // <MatchEvents> on the knockout card once these games play.
            goals: liveMatch.goals ?? [],
            bookings: liveMatch.bookings ?? [],
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
