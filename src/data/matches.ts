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
  // Opening Day - June 11, 2026
  createMatch('A1', 'mex', 'rsa', 'June 11, 2026', '12:00', 'Estadio Azteca', 'Mexico City', 'A'),
  createMatch('D1', 'usa', 'tur', 'June 11, 2026', '18:00', 'SoFi Stadium', 'Los Angeles', 'D'),
  
  // June 12, 2026
  createMatch('A2', 'kor', 'den', 'June 12, 2026', '12:00', 'Estadio Akron', 'Guadalajara', 'A'),
  createMatch('B1', 'can', 'sui', 'June 12, 2026', '15:00', 'BC Place', 'Vancouver', 'B'),
  createMatch('B2', 'ita', 'qat', 'June 12, 2026', '18:00', 'BMO Field', 'Toronto', 'B'),
  createMatch('D2', 'par', 'aus', 'June 12, 2026', '21:00', 'NRG Stadium', 'Houston', 'D'),
  
  // June 13, 2026
  createMatch('C1', 'bra', 'sco', 'June 13, 2026', '15:00', 'SoFi Stadium', 'Los Angeles', 'C'),
  createMatch('C2', 'mar', 'hai', 'June 13, 2026', '18:00', 'Levi\'s Stadium', 'San Francisco', 'C'),
  createMatch('E1', 'ger', 'ecu', 'June 13, 2026', '18:00', 'Hard Rock Stadium', 'Miami', 'E'),
  createMatch('E2', 'civ', 'cur', 'June 13, 2026', '21:00', 'Mercedes-Benz Stadium', 'Atlanta', 'E'),
  
  // June 14, 2026
  createMatch('F1', 'ned', 'tun', 'June 14, 2026', '15:00', 'MetLife Stadium', 'New York', 'F'),
  createMatch('F2', 'jpn', 'ukr', 'June 14, 2026', '18:00', 'Lincoln Financial Field', 'Philadelphia', 'F'),
  createMatch('G1', 'bel', 'nzl', 'June 14, 2026', '18:00', 'Lumen Field', 'Seattle', 'G'),
  createMatch('G2', 'egy', 'irn', 'June 14, 2026', '21:00', 'Levi\'s Stadium', 'San Francisco', 'G'),
  
  // June 15, 2026
  createMatch('H1', 'esp', 'uru', 'June 15, 2026', '15:00', 'Arrowhead Stadium', 'Kansas City', 'H'),
  createMatch('H2', 'ksa', 'cpv', 'June 15, 2026', '18:00', 'AT&T Stadium', 'Dallas', 'H'),
  createMatch('I1', 'fra', 'nor', 'June 15, 2026', '18:00', 'Gillette Stadium', 'Boston', 'I'),
  createMatch('I2', 'sen', 'bol', 'June 15, 2026', '21:00', 'Lincoln Financial Field', 'Philadelphia', 'I'),
  
  // June 16, 2026
  createMatch('J1', 'arg', 'jor', 'June 16, 2026', '15:00', 'Hard Rock Stadium', 'Miami', 'J'),
  createMatch('J2', 'alg', 'aut', 'June 16, 2026', '18:00', 'Mercedes-Benz Stadium', 'Atlanta', 'J'),
  createMatch('K1', 'por', 'col', 'June 16, 2026', '18:00', 'SoFi Stadium', 'Los Angeles', 'K'),
  createMatch('K2', 'uzb', 'jam', 'June 16, 2026', '21:00', 'Lumen Field', 'Seattle', 'K'),
  
  // June 17, 2026
  createMatch('L1', 'eng', 'pan', 'June 17, 2026', '15:00', 'MetLife Stadium', 'New York', 'L'),
  createMatch('L2', 'cro', 'gha', 'June 17, 2026', '18:00', 'NRG Stadium', 'Houston', 'L'),
  
  // Matchday 2 - June 18-23
  createMatch('A3', 'mex', 'kor', 'June 18, 2026', '15:00', 'Estadio Azteca', 'Mexico City', 'A'),
  createMatch('A4', 'den', 'rsa', 'June 18, 2026', '18:00', 'Estadio Akron', 'Guadalajara', 'A'),
  createMatch('D3', 'usa', 'par', 'June 18, 2026', '21:00', 'AT&T Stadium', 'Dallas', 'D'),
  
  createMatch('B3', 'can', 'ita', 'June 19, 2026', '15:00', 'BC Place', 'Vancouver', 'B'),
  createMatch('B4', 'sui', 'qat', 'June 19, 2026', '18:00', 'BMO Field', 'Toronto', 'B'),
  createMatch('D4', 'tur', 'aus', 'June 19, 2026', '21:00', 'NRG Stadium', 'Houston', 'D'),
  
  createMatch('C3', 'bra', 'mar', 'June 20, 2026', '18:00', 'SoFi Stadium', 'Los Angeles', 'C'),
  createMatch('C4', 'sco', 'hai', 'June 20, 2026', '15:00', 'Levi\'s Stadium', 'San Francisco', 'C'),
  createMatch('E3', 'ger', 'civ', 'June 20, 2026', '21:00', 'Mercedes-Benz Stadium', 'Atlanta', 'E'),
  createMatch('E4', 'ecu', 'cur', 'June 20, 2026', '18:00', 'Hard Rock Stadium', 'Miami', 'E'),
  
  createMatch('F3', 'ned', 'jpn', 'June 21, 2026', '18:00', 'MetLife Stadium', 'New York', 'F'),
  createMatch('F4', 'ukr', 'tun', 'June 21, 2026', '15:00', 'Lincoln Financial Field', 'Philadelphia', 'F'),
  createMatch('G3', 'bel', 'egy', 'June 21, 2026', '21:00', 'Lumen Field', 'Seattle', 'G'),
  createMatch('G4', 'irn', 'nzl', 'June 21, 2026', '18:00', 'Levi\'s Stadium', 'San Francisco', 'G'),
  
  createMatch('H3', 'esp', 'ksa', 'June 22, 2026', '15:00', 'Arrowhead Stadium', 'Kansas City', 'H'),
  createMatch('H4', 'uru', 'cpv', 'June 22, 2026', '18:00', 'AT&T Stadium', 'Dallas', 'H'),
  createMatch('I3', 'fra', 'sen', 'June 22, 2026', '21:00', 'Gillette Stadium', 'Boston', 'I'),
  createMatch('I4', 'nor', 'bol', 'June 22, 2026', '18:00', 'Lincoln Financial Field', 'Philadelphia', 'I'),
  
  createMatch('J3', 'arg', 'alg', 'June 23, 2026', '18:00', 'Hard Rock Stadium', 'Miami', 'J'),
  createMatch('J4', 'aut', 'jor', 'June 23, 2026', '15:00', 'Mercedes-Benz Stadium', 'Atlanta', 'J'),
  createMatch('K3', 'por', 'uzb', 'June 23, 2026', '21:00', 'SoFi Stadium', 'Los Angeles', 'K'),
  createMatch('K4', 'col', 'jam', 'June 23, 2026', '18:00', 'Lumen Field', 'Seattle', 'K'),
  
  createMatch('L3', 'eng', 'cro', 'June 24, 2026', '18:00', 'MetLife Stadium', 'New York', 'L'),
  createMatch('L4', 'gha', 'pan', 'June 24, 2026', '15:00', 'NRG Stadium', 'Houston', 'L'),
  
  // Matchday 3 - June 25-30 (Simultaneous kick-offs per group)
  createMatch('A5', 'mex', 'den', 'June 25, 2026', '18:00', 'Estadio Azteca', 'Mexico City', 'A'),
  createMatch('A6', 'rsa', 'kor', 'June 25, 2026', '18:00', 'Estadio Akron', 'Guadalajara', 'A'),
  createMatch('D5', 'usa', 'aus', 'June 25, 2026', '21:00', 'AT&T Stadium', 'Dallas', 'D'),
  createMatch('D6', 'tur', 'par', 'June 25, 2026', '21:00', 'NRG Stadium', 'Houston', 'D'),
  
  createMatch('B5', 'can', 'qat', 'June 26, 2026', '18:00', 'BC Place', 'Vancouver', 'B'),
  createMatch('B6', 'sui', 'ita', 'June 26, 2026', '18:00', 'BMO Field', 'Toronto', 'B'),
  createMatch('C5', 'bra', 'hai', 'June 26, 2026', '21:00', 'SoFi Stadium', 'Los Angeles', 'C'),
  createMatch('C6', 'sco', 'mar', 'June 26, 2026', '21:00', 'Levi\'s Stadium', 'San Francisco', 'C'),
  
  createMatch('E5', 'ger', 'cur', 'June 27, 2026', '18:00', 'Hard Rock Stadium', 'Miami', 'E'),
  createMatch('E6', 'ecu', 'civ', 'June 27, 2026', '18:00', 'Mercedes-Benz Stadium', 'Atlanta', 'E'),
  createMatch('F5', 'ned', 'ukr', 'June 27, 2026', '21:00', 'MetLife Stadium', 'New York', 'F'),
  createMatch('F6', 'tun', 'jpn', 'June 27, 2026', '21:00', 'Lincoln Financial Field', 'Philadelphia', 'F'),
  
  createMatch('G5', 'bel', 'irn', 'June 28, 2026', '18:00', 'Lumen Field', 'Seattle', 'G'),
  createMatch('G6', 'nzl', 'egy', 'June 28, 2026', '18:00', 'Levi\'s Stadium', 'San Francisco', 'G'),
  createMatch('H5', 'esp', 'cpv', 'June 28, 2026', '21:00', 'Arrowhead Stadium', 'Kansas City', 'H'),
  createMatch('H6', 'uru', 'ksa', 'June 28, 2026', '21:00', 'AT&T Stadium', 'Dallas', 'H'),
  
  createMatch('I5', 'fra', 'bol', 'June 29, 2026', '18:00', 'Gillette Stadium', 'Boston', 'I'),
  createMatch('I6', 'nor', 'sen', 'June 29, 2026', '18:00', 'Lincoln Financial Field', 'Philadelphia', 'I'),
  createMatch('J5', 'arg', 'aut', 'June 29, 2026', '21:00', 'Hard Rock Stadium', 'Miami', 'J'),
  createMatch('J6', 'jor', 'alg', 'June 29, 2026', '21:00', 'Mercedes-Benz Stadium', 'Atlanta', 'J'),
  
  createMatch('K5', 'por', 'jam', 'June 30, 2026', '18:00', 'SoFi Stadium', 'Los Angeles', 'K'),
  createMatch('K6', 'col', 'uzb', 'June 30, 2026', '18:00', 'Lumen Field', 'Seattle', 'K'),
  createMatch('L5', 'eng', 'gha', 'June 30, 2026', '21:00', 'MetLife Stadium', 'New York', 'L'),
  createMatch('L6', 'pan', 'cro', 'June 30, 2026', '21:00', 'NRG Stadium', 'Houston', 'L'),
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
