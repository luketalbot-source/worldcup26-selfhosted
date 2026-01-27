import { Match, Team, GroupStanding } from '@/types/match';
import { teams } from '@/data/teams';
import { KnockoutMatch, round32Matches, round16Matches, quarterFinalMatches, semiFinalMatches, thirdPlaceMatch, finalMatch } from '@/data/knockoutMatches';

// Calculate standings for a single group based on completed matches
export function calculateGroupStandings(groupMatches: Match[], group: string): GroupStanding[] {
  const groupTeams = teams.filter(t => t.group === group);
  
  const standings: GroupStanding[] = groupTeams.map(team => ({
    team,
    played: 0,
    won: 0,
    drawn: 0,
    lost: 0,
    goalsFor: 0,
    goalsAgainst: 0,
    goalDifference: 0,
    points: 0,
  }));

  // Process finished matches
  const finishedMatches = groupMatches.filter(m => m.status === 'finished' && m.homeScore !== undefined && m.awayScore !== undefined);
  
  for (const match of finishedMatches) {
    const homeStanding = standings.find(s => s.team.code === match.homeTeam.code);
    const awayStanding = standings.find(s => s.team.code === match.awayTeam.code);
    
    if (!homeStanding || !awayStanding) continue;
    
    const homeScore = match.homeScore!;
    const awayScore = match.awayScore!;
    
    // Update played
    homeStanding.played++;
    awayStanding.played++;
    
    // Update goals
    homeStanding.goalsFor += homeScore;
    homeStanding.goalsAgainst += awayScore;
    awayStanding.goalsFor += awayScore;
    awayStanding.goalsAgainst += homeScore;
    
    // Update win/draw/loss and points
    if (homeScore > awayScore) {
      homeStanding.won++;
      homeStanding.points += 3;
      awayStanding.lost++;
    } else if (homeScore < awayScore) {
      awayStanding.won++;
      awayStanding.points += 3;
      homeStanding.lost++;
    } else {
      homeStanding.drawn++;
      awayStanding.drawn++;
      homeStanding.points += 1;
      awayStanding.points += 1;
    }
  }

  // Calculate goal difference
  standings.forEach(s => {
    s.goalDifference = s.goalsFor - s.goalsAgainst;
  });

  // Sort by: points, goal difference, goals for
  standings.sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    if (b.goalDifference !== a.goalDifference) return b.goalDifference - a.goalDifference;
    return b.goalsFor - a.goalsFor;
  });

  return standings;
}

// Get qualified teams from all groups
export interface QualifiedTeams {
  groupWinners: Record<string, Team | null>; // 1st place from each group
  groupRunnersUp: Record<string, Team | null>; // 2nd place from each group
  bestThirdPlace: Team[]; // 8 best 3rd place teams
}

export function getQualifiedTeams(
  allGroupStandings: Record<string, GroupStanding[]>
): QualifiedTeams {
  const groups = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'];
  
  const groupWinners: Record<string, Team | null> = {};
  const groupRunnersUp: Record<string, Team | null> = {};
  const thirdPlaceTeams: { team: Team; standing: GroupStanding; group: string }[] = [];

  for (const group of groups) {
    const standings = allGroupStandings[group] || [];
    
    // Check if group stage is complete (each team played 3 matches)
    const isComplete = standings.length >= 4 && standings.every(s => s.played === 3);
    
    if (isComplete) {
      groupWinners[group] = standings[0]?.team || null;
      groupRunnersUp[group] = standings[1]?.team || null;
      if (standings[2]) {
        thirdPlaceTeams.push({ team: standings[2].team, standing: standings[2], group });
      }
    } else {
      groupWinners[group] = null;
      groupRunnersUp[group] = null;
    }
  }

  // Sort third place teams and take best 8
  thirdPlaceTeams.sort((a, b) => {
    if (b.standing.points !== a.standing.points) return b.standing.points - a.standing.points;
    if (b.standing.goalDifference !== a.standing.goalDifference) return b.standing.goalDifference - a.standing.goalDifference;
    return b.standing.goalsFor - a.standing.goalsFor;
  });

  const bestThirdPlace = thirdPlaceTeams.slice(0, 8).map(t => t.team);

  return { groupWinners, groupRunnersUp, bestThirdPlace };
}

// Resolve a team source (e.g., "1A", "2B", "3CDE") to an actual team
function resolveTeamSource(
  source: string | undefined,
  qualified: QualifiedTeams,
  knockoutResults: Record<string, { winner?: Team; loser?: Team }>
): Team | null {
  if (!source) return null;

  // Check if it's a knockout match reference (e.g., "R32-1", "R16-2", "QF-1", "SF-1")
  if (source.startsWith('R32-') || source.startsWith('R16-') || source.startsWith('QF-') || source.startsWith('SF-')) {
    const result = knockoutResults[source];
    return result?.winner || null;
  }

  // Check for loser reference (e.g., "SF-1-L")
  if (source.endsWith('-L')) {
    const matchId = source.replace('-L', '');
    const result = knockoutResults[matchId];
    return result?.loser || null;
  }

  // Group position reference (e.g., "1A" = 1st place Group A)
  if (/^[12][A-L]$/.test(source)) {
    const position = parseInt(source[0]);
    const group = source[1];
    if (position === 1) {
      return qualified.groupWinners[group] || null;
    } else {
      return qualified.groupRunnersUp[group] || null;
    }
  }

  // Third place reference (e.g., "3CDE" = 3rd place from groups C, D, or E)
  if (source.startsWith('3')) {
    // For now, we can't determine exact 3rd place team without the full draw rules
    // This would need FIFA's specific 3rd place matching table
    return null;
  }

  return null;
}

// Create a TBD team placeholder
function createTBDTeam(label: string): Team {
  return {
    id: `tbd-${label}`,
    name: label,
    code: 'TBD',
    flag: '🏳️',
    group: '',
  };
}

// Populate knockout matches with actual team data
export function populateKnockoutMatches(
  qualified: QualifiedTeams,
  knockoutResults: Record<string, { winner?: Team; loser?: Team }> = {}
): {
  round32: KnockoutMatch[];
  round16: KnockoutMatch[];
  quarterFinals: KnockoutMatch[];
  semiFinals: KnockoutMatch[];
  thirdPlace: KnockoutMatch;
  final: KnockoutMatch;
} {
  const populateMatch = (match: KnockoutMatch): KnockoutMatch => {
    const homeTeam = resolveTeamSource(match.homeTeamSource, qualified, knockoutResults);
    const awayTeam = resolveTeamSource(match.awayTeamSource, qualified, knockoutResults);

    return {
      ...match,
      homeTeam: homeTeam || createTBDTeam(match.homeTeamSource || 'TBD'),
      awayTeam: awayTeam || createTBDTeam(match.awayTeamSource || 'TBD'),
    };
  };

  return {
    round32: round32Matches.map(populateMatch),
    round16: round16Matches.map(populateMatch),
    quarterFinals: quarterFinalMatches.map(populateMatch),
    semiFinals: semiFinalMatches.map(populateMatch),
    thirdPlace: populateMatch(thirdPlaceMatch),
    final: populateMatch(finalMatch),
  };
}

// Check if a knockout match has a determined winner
export function getKnockoutMatchResult(
  match: KnockoutMatch
): { winner?: Team; loser?: Team } | null {
  if (match.status !== 'finished' || match.homeScore === undefined || match.awayScore === undefined) {
    return null;
  }

  // In knockout, there must be a winner (could be after extra time/penalties)
  if (match.homeScore > match.awayScore) {
    return { winner: match.homeTeam, loser: match.awayTeam };
  } else if (match.awayScore > match.homeScore) {
    return { winner: match.awayTeam, loser: match.homeTeam };
  }

  // If scores are equal (penalties needed), we'd need additional data
  // For now, return null to indicate undetermined
  return null;
}
