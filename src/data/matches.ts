import { Match } from '@/types/match';
import { getTeamById } from './teams';

const createMatch = (
  id: string,
  homeId: string,
  awayId: string,
  date: string,
  time: string,
  venue: string,
  city: string,
  group: string,
  status: 'upcoming' | 'live' | 'finished' = 'upcoming',
  homeScore?: number,
  awayScore?: number
): Match => ({
  id,
  homeTeam: getTeamById(homeId)!,
  awayTeam: getTeamById(awayId)!,
  date,
  time,
  venue,
  city,
  stage: 'group',
  group,
  status,
  homeScore,
  awayScore,
});

export const groupStageMatches: Match[] = [
  // Group A - Day 1
  createMatch('A1', 'usa', 'col', 'June 11, 2026', '18:00', 'SoFi Stadium', 'Los Angeles', 'A'),
  createMatch('A2', 'mex', 'can', 'June 11, 2026', '21:00', 'Estadio Azteca', 'Mexico City', 'A'),
  
  // Group B - Day 1
  createMatch('B1', 'bra', 'kor', 'June 12, 2026', '15:00', 'MetLife Stadium', 'New York', 'B'),
  createMatch('B2', 'arg', 'jpn', 'June 12, 2026', '18:00', 'AT&T Stadium', 'Dallas', 'B'),
  
  // Group C - Day 1
  createMatch('C1', 'ger', 'ned', 'June 13, 2026', '15:00', 'Mercedes-Benz Stadium', 'Atlanta', 'C'),
  createMatch('C2', 'fra', 'esp', 'June 13, 2026', '18:00', 'Hard Rock Stadium', 'Miami', 'C'),
  
  // Group D - Day 1
  createMatch('D1', 'eng', 'sen', 'June 14, 2026', '15:00', 'Lumen Field', 'Seattle', 'D'),
  createMatch('D2', 'por', 'bel', 'June 14, 2026', '18:00', 'Lincoln Financial Field', 'Philadelphia', 'D'),
  
  // Group E - Day 1
  createMatch('E1', 'ita', 'mar', 'June 15, 2026', '15:00', 'Levi\'s Stadium', 'San Francisco', 'E'),
  createMatch('E2', 'uru', 'cro', 'June 15, 2026', '18:00', 'NRG Stadium', 'Houston', 'E'),
  
  // Group F - Day 1
  createMatch('F1', 'pol', 'aus', 'June 16, 2026', '15:00', 'Arrowhead Stadium', 'Kansas City', 'F'),
  createMatch('F2', 'den', 'sui', 'June 16, 2026', '18:00', 'Gillette Stadium', 'Boston', 'F'),
  
  // Group A - Day 2
  createMatch('A3', 'usa', 'mex', 'June 17, 2026', '21:00', 'AT&T Stadium', 'Dallas', 'A'),
  createMatch('A4', 'col', 'can', 'June 17, 2026', '18:00', 'BC Place', 'Vancouver', 'A'),
  
  // Group B - Day 2
  createMatch('B3', 'bra', 'arg', 'June 18, 2026', '21:00', 'MetLife Stadium', 'New York', 'B'),
  createMatch('B4', 'kor', 'jpn', 'June 18, 2026', '18:00', 'SoFi Stadium', 'Los Angeles', 'B'),
  
  // Group C - Day 2
  createMatch('C3', 'ger', 'fra', 'June 19, 2026', '18:00', 'Mercedes-Benz Stadium', 'Atlanta', 'C'),
  createMatch('C4', 'ned', 'esp', 'June 19, 2026', '21:00', 'Hard Rock Stadium', 'Miami', 'C'),
  
  // Group D - Day 2
  createMatch('D3', 'eng', 'por', 'June 20, 2026', '18:00', 'Lumen Field', 'Seattle', 'D'),
  createMatch('D4', 'sen', 'bel', 'June 20, 2026', '21:00', 'Lincoln Financial Field', 'Philadelphia', 'D'),
  
  // Group E - Day 2
  createMatch('E3', 'ita', 'uru', 'June 21, 2026', '18:00', 'Levi\'s Stadium', 'San Francisco', 'E'),
  createMatch('E4', 'mar', 'cro', 'June 21, 2026', '21:00', 'NRG Stadium', 'Houston', 'E'),
  
  // Group F - Day 2
  createMatch('F3', 'pol', 'den', 'June 22, 2026', '18:00', 'Arrowhead Stadium', 'Kansas City', 'F'),
  createMatch('F4', 'aus', 'sui', 'June 22, 2026', '21:00', 'Gillette Stadium', 'Boston', 'F'),
];

export const getMatchesByGroup = (group: string): Match[] => {
  return groupStageMatches.filter(match => match.group === group);
};

export const getMatchesByDate = (date: string): Match[] => {
  return groupStageMatches.filter(match => match.date === date);
};

export const getUpcomingMatches = (): Match[] => {
  return groupStageMatches.filter(match => match.status === 'upcoming');
};
