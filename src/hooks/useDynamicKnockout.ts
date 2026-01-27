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

  // Get matches by knockout stage
  const getKnockoutStageMatches = (stage: string): KnockoutMatch[] => {
    switch (stage) {
      case 'round32':
        return knockoutBracket.round32;
      case 'round16':
        return knockoutBracket.round16;
      case 'quarter':
        return knockoutBracket.quarterFinals;
      case 'semi':
        return knockoutBracket.semiFinals;
      case 'third':
        return [knockoutBracket.thirdPlace];
      case 'final':
        return [knockoutBracket.final];
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
