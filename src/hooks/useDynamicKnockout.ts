import { useMemo } from 'react';
import { useLiveMatches } from './useLiveMatches';
import { Match, GroupStanding } from '@/types/match';
import { KnockoutMatch } from '@/data/knockoutMatches';
import { groupStageMatches } from '@/data/matches';
import {
  calculateGroupStandings,
  getQualifiedTeams,
  populateKnockoutMatches,
  getKnockoutMatchResult,
  QualifiedTeams
} from '@/lib/knockoutCalculator';

// FD status → UI status. Same logic as in useLiveMatches but local to this
// hook so we don't re-import an internal helper.
function mapApiStatus(apiStatus: string): 'upcoming' | 'live' | 'finished' {
  switch (apiStatus) {
    case 'FINISHED':
      return 'finished';
    case 'IN_PLAY':
    case 'PAUSED':
    case 'LIVE':
      return 'live';
    default:
      return 'upcoming';
  }
}

export const useDynamicKnockout = () => {
  const { liveMatches, loading, getGroupMatches } = useLiveMatches();

  // Calculate all group standings
  const allGroupStandings = useMemo(() => {
    const groups = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'];
    const standings: Record<string, GroupStanding[]> = {};

    for (const group of groups) {
      const groupMatches = getGroupMatches(group);
      standings[group] = calculateGroupStandings(groupMatches, group);
    }

    return standings;
  }, [getGroupMatches]);

  // Get qualified teams from group stage
  const qualifiedTeams = useMemo(() => {
    return getQualifiedTeams(allGroupStandings);
  }, [allGroupStandings]);

  // Build knockout results from finished knockout matches
  const knockoutResults = useMemo(() => {
    const results: Record<string, { winner?: any; loser?: any }> = {};
    
    // Get knockout matches from live data
    const knockoutMatches = liveMatches.filter(m => 
      m.stage !== 'group' && m.status === 'FINISHED'
    );

    for (const match of knockoutMatches) {
      if (match.home_score !== null && match.away_score !== null) {
        const homeTeam = {
          id: match.home_team_code.toLowerCase(),
          name: match.home_team_name,
          code: match.home_team_code,
          flag: '🏳️',
          group: '',
        };
        const awayTeam = {
          id: match.away_team_code.toLowerCase(),
          name: match.away_team_name,
          code: match.away_team_code,
          flag: '🏳️',
          group: '',
        };

        if (match.home_score > match.away_score) {
          results[match.match_id] = { winner: homeTeam, loser: awayTeam };
        } else if (match.away_score > match.home_score) {
          results[match.match_id] = { winner: awayTeam, loser: homeTeam };
        }
      }
    }

    return results;
  }, [liveMatches]);

  // Populate knockout matches with actual teams
  const knockoutBracket = useMemo(() => {
    return populateKnockoutMatches(qualifiedTeams, knockoutResults);
  }, [qualifiedTeams, knockoutResults]);

  // Merge in-play live data (scores, status, real team codes/names) onto
  // each populated bracket entry. Without this, the KO view shows only the
  // static fixture data — so admin overrides and FD live scores never
  // appeared during a knockout match.
  //
  // Match strategy, in priority order:
  //   1. Bracket id `M{n}` → live row with `api_match_id = n` (FD's stable
  //      match number — works as soon as FD publishes the bracket).
  //   2. Both team codes match (after the draw, when bracket positions
  //      have been resolved to real teams).
  // The first wins because it survives team-code mismatches and admin
  // edits to the bracket.
  const mergeLiveOntoBracket = useMemo(() => {
    return (matches: KnockoutMatch[]): KnockoutMatch[] => matches.map((m) => {
      const apiNumber =
        typeof m.id === 'string' && /^M\d+$/.test(m.id) ? Number(m.id.slice(1)) : NaN;

      const live =
        liveMatches.find(
          (lm) => lm.stage !== 'group' && lm.api_match_id === apiNumber,
        ) ??
        liveMatches.find(
          (lm) =>
            lm.stage !== 'group' &&
            lm.home_team_code === m.homeTeam.code &&
            lm.away_team_code === m.awayTeam.code,
        );

      if (!live) return m;

      return {
        ...m,
        // Surface live team metadata once the bracket resolves (e.g. R32
        // populated with real team codes after group stage finishes).
        homeTeam: {
          ...m.homeTeam,
          name: live.home_team_name || m.homeTeam.name,
          code: live.home_team_code || m.homeTeam.code,
        },
        awayTeam: {
          ...m.awayTeam,
          name: live.away_team_name || m.awayTeam.name,
          code: live.away_team_code || m.awayTeam.code,
        },
        homeScore: live.home_score ?? m.homeScore,
        awayScore: live.away_score ?? m.awayScore,
        // PSO + duration only apply to knockout — group hooks skip
        // these fields. Undefined for unplayed / regulation finishes
        // so the badge code can early-return cleanly.
        penaltyHomeScore: live.penalty_home_score ?? undefined,
        penaltyAwayScore: live.penalty_away_score ?? undefined,
        duration: live.duration ?? undefined,
        status: mapApiStatus(live.status),
      };
    });
  }, [liveMatches]);

  // Get matches by knockout stage. Always pass through mergeLiveOntoBracket
  // so the consumer sees live scores without any extra wiring on its end.
  const getKnockoutStageMatches = (stage: string): KnockoutMatch[] => {
    switch (stage) {
      case 'round32':
        return mergeLiveOntoBracket(knockoutBracket.round32);
      case 'round16':
        return mergeLiveOntoBracket(knockoutBracket.round16);
      case 'quarter':
        return mergeLiveOntoBracket(knockoutBracket.quarterFinals);
      case 'semi':
        return mergeLiveOntoBracket(knockoutBracket.semiFinals);
      case 'third':
        return mergeLiveOntoBracket([knockoutBracket.thirdPlace]);
      case 'final':
        return mergeLiveOntoBracket([knockoutBracket.final]);
      default:
        return [];
    }
  };

  // Check if all group stages are complete
  const areGroupStagesComplete = useMemo(() => {
    const groups = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'];
    return groups.every(group => {
      const standings = allGroupStandings[group];
      return standings && standings.length >= 4 && standings.every(s => s.played === 3);
    });
  }, [allGroupStandings]);

  // Get summary of qualification status
  const qualificationSummary = useMemo(() => {
    const groups = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'];
    const qualified: string[] = [];
    const pending: string[] = [];

    for (const group of groups) {
      if (qualifiedTeams.groupWinners[group]) {
        qualified.push(`Group ${group}`);
      } else {
        pending.push(`Group ${group}`);
      }
    }

    return { qualified, pending, total: groups.length };
  }, [qualifiedTeams]);

  return {
    loading,
    allGroupStandings,
    qualifiedTeams,
    knockoutBracket,
    getKnockoutStageMatches,
    areGroupStagesComplete,
    qualificationSummary,
  };
};
