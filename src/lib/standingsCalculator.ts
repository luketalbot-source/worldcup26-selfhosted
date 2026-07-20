// One standings engine, three consumers: WC group tables, the CL Swiss
// league-phase table, and the Bundesliga table. Extracted verbatim from
// MatchesView's inline calculateStandings (3pts/win, tiebreaks: points →
// goal difference → goals for) so the group view and the new league tables
// can't drift apart.
//
// Counts FINISHED matches only; unplayed rows contribute nothing.

import type { GroupStanding, Match, Team } from '@/types/match';

export const calculateStandings = (
  matches: Match[],
  teams: Team[],
): GroupStanding[] => {
  const standingsMap = new Map<string, GroupStanding>();

  // Initialize all teams with zero stats
  teams.forEach((team) => {
    standingsMap.set(team.id, {
      team,
      played: 0,
      won: 0,
      drawn: 0,
      lost: 0,
      goalsFor: 0,
      goalsAgainst: 0,
      goalDifference: 0,
      points: 0,
    });
  });

  const finished = matches.filter((m) => m.status === 'finished');

  finished.forEach((match) => {
    const homeTeam = standingsMap.get(match.homeTeam.id);
    const awayTeam = standingsMap.get(match.awayTeam.id);

    if (!homeTeam || !awayTeam || match.homeScore === undefined || match.awayScore === undefined) return;

    const homeScore = match.homeScore;
    const awayScore = match.awayScore;

    homeTeam.played++;
    awayTeam.played++;

    homeTeam.goalsFor += homeScore;
    homeTeam.goalsAgainst += awayScore;
    awayTeam.goalsFor += awayScore;
    awayTeam.goalsAgainst += homeScore;

    homeTeam.goalDifference = homeTeam.goalsFor - homeTeam.goalsAgainst;
    awayTeam.goalDifference = awayTeam.goalsFor - awayTeam.goalsAgainst;

    if (homeScore > awayScore) {
      homeTeam.won++;
      homeTeam.points += 3;
      awayTeam.lost++;
    } else if (awayScore > homeScore) {
      awayTeam.won++;
      awayTeam.points += 3;
      homeTeam.lost++;
    } else {
      homeTeam.drawn++;
      awayTeam.drawn++;
      homeTeam.points += 1;
      awayTeam.points += 1;
    }
  });

  return Array.from(standingsMap.values()).sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    if (b.goalDifference !== a.goalDifference) return b.goalDifference - a.goalDifference;
    return b.goalsFor - a.goalsFor;
  });
};

/** WC group view: same engine, filtered to one group first. */
export const calculateGroupStandings = (
  group: string,
  matches: Match[],
  teams: Team[],
): GroupStanding[] =>
  calculateStandings(matches.filter((m) => m.group === group), teams);

/** Last-5 form per team id ('W' | 'D' | 'L', most recent LAST), for the
 *  league table's form dots. */
export const calculateForm = (matches: Match[], teamId: string, n = 5): ('W' | 'D' | 'L')[] => {
  const finished = matches
    .filter(
      (m) =>
        m.status === 'finished' &&
        m.homeScore !== undefined &&
        m.awayScore !== undefined &&
        (m.homeTeam.id === teamId || m.awayTeam.id === teamId),
    )
    .sort((a, b) => new Date(a.dateIso ?? a.date).getTime() - new Date(b.dateIso ?? b.date).getTime());
  return finished.slice(-n).map((m) => {
    const isHome = m.homeTeam.id === teamId;
    const ours = isHome ? m.homeScore! : m.awayScore!;
    const theirs = isHome ? m.awayScore! : m.homeScore!;
    return ours > theirs ? 'W' : ours === theirs ? 'D' : 'L';
  });
};
