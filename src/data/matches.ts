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

// All times are in ET (Eastern Time) - the standard reference for FIFA World Cup 2026
export const groupStageMatches: Match[] = [
  // ============ TEST MATCH (22:50 Germany time) ============
  createMatch('TEST1', 'eng', 'bra', 'January 27, 2026', '16:50', 'Test Stadium', 'Test City', 'A'),

  // ============ MATCHDAY 1 ============
  
  // June 11, 2026
  createMatch('A1', 'mex', 'rsa', 'June 11, 2026', '15:00', 'Estadio Azteca', 'Mexico City', 'A'),
  createMatch('A2', 'kor', 'uefd', 'June 11, 2026', '22:00', 'Estadio Akron', 'Guadalajara', 'A'),
  
  // June 12, 2026
  createMatch('B1', 'can', 'uefa', 'June 12, 2026', '15:00', 'BMO Field', 'Toronto', 'B'),
  createMatch('D1', 'usa', 'par', 'June 12, 2026', '21:00', 'SoFi Stadium', 'Los Angeles', 'D'),
  
  // June 13, 2026
  createMatch('C1', 'bra', 'mar', 'June 13, 2026', '15:00', 'MetLife Stadium', 'New York', 'C'),
  createMatch('D2', 'aus', 'uefc', 'June 13, 2026', '18:00', 'BC Place', 'Vancouver', 'D'),
  createMatch('C2', 'hai', 'sco', 'June 13, 2026', '21:00', 'Gillette Stadium', 'Boston', 'C'),
  createMatch('B2', 'qat', 'sui', 'June 14, 2026', '00:00', 'Levi\'s Stadium', 'San Francisco', 'B'),
  
  // June 14, 2026
  createMatch('E1', 'ger', 'cur', 'June 14, 2026', '13:00', 'NRG Stadium', 'Houston', 'E'),
  createMatch('E2', 'civ', 'ecu', 'June 14, 2026', '16:00', 'Lincoln Financial Field', 'Philadelphia', 'E'),
  createMatch('F1', 'ned', 'jpn', 'June 14, 2026', '19:00', 'AT&T Stadium', 'Dallas', 'F'),
  createMatch('F2', 'uefb', 'tun', 'June 14, 2026', '22:00', 'Estadio BBVA', 'Monterrey', 'F'),
  
  // June 15, 2026
  createMatch('H1', 'esp', 'cpv', 'June 15, 2026', '12:00', 'Mercedes-Benz Stadium', 'Atlanta', 'H'),
  createMatch('G1', 'bel', 'egy', 'June 15, 2026', '15:00', 'Lumen Field', 'Seattle', 'G'),
  createMatch('H2', 'ksa', 'uru', 'June 15, 2026', '18:00', 'Hard Rock Stadium', 'Miami', 'H'),
  createMatch('G2', 'irn', 'nzl', 'June 15, 2026', '21:00', 'SoFi Stadium', 'Los Angeles', 'G'),
  
  // June 16, 2026
  createMatch('I1', 'fra', 'sen', 'June 16, 2026', '15:00', 'MetLife Stadium', 'New York', 'I'),
  createMatch('I2', 'fpo2', 'nor', 'June 16, 2026', '18:00', 'Gillette Stadium', 'Boston', 'I'),
  createMatch('J1', 'arg', 'alg', 'June 16, 2026', '21:00', 'Arrowhead Stadium', 'Kansas City', 'J'),
  createMatch('J2', 'aut', 'jor', 'June 17, 2026', '00:00', 'Levi\'s Stadium', 'San Francisco', 'J'),
  
  // June 17, 2026
  createMatch('K1', 'por', 'fpo1', 'June 17, 2026', '13:00', 'NRG Stadium', 'Houston', 'K'),
  createMatch('L1', 'eng', 'cro', 'June 17, 2026', '16:00', 'AT&T Stadium', 'Dallas', 'L'),
  createMatch('L2', 'gha', 'pan', 'June 17, 2026', '19:00', 'BMO Field', 'Toronto', 'L'),
  createMatch('K2', 'uzb', 'col', 'June 17, 2026', '22:00', 'Estadio Azteca', 'Mexico City', 'K'),
  
  // ============ MATCHDAY 2 ============
  
  // June 18, 2026
  createMatch('A3', 'uefd', 'rsa', 'June 18, 2026', '12:00', 'Mercedes-Benz Stadium', 'Atlanta', 'A'),
  createMatch('B3', 'sui', 'uefa', 'June 18, 2026', '15:00', 'SoFi Stadium', 'Los Angeles', 'B'),
  createMatch('B4', 'can', 'qat', 'June 18, 2026', '18:00', 'BC Place', 'Vancouver', 'B'),
  createMatch('A4', 'mex', 'kor', 'June 18, 2026', '21:00', 'Estadio Akron', 'Guadalajara', 'A'),
  
  // June 19, 2026
  createMatch('D3', 'usa', 'aus', 'June 19, 2026', '15:00', 'Lumen Field', 'Seattle', 'D'),
  createMatch('C3', 'sco', 'mar', 'June 19, 2026', '18:00', 'Gillette Stadium', 'Boston', 'C'),
  createMatch('C4', 'bra', 'hai', 'June 19, 2026', '21:00', 'Lincoln Financial Field', 'Philadelphia', 'C'),
  createMatch('D4', 'uefc', 'par', 'June 20, 2026', '00:00', 'Levi\'s Stadium', 'San Francisco', 'D'),
  
  // June 20, 2026
  createMatch('F3', 'ned', 'uefb', 'June 20, 2026', '13:00', 'NRG Stadium', 'Houston', 'F'),
  createMatch('E3', 'ger', 'civ', 'June 20, 2026', '16:00', 'BMO Field', 'Toronto', 'E'),
  createMatch('E4', 'ecu', 'cur', 'June 20, 2026', '20:00', 'Arrowhead Stadium', 'Kansas City', 'E'),
  createMatch('F4', 'tun', 'jpn', 'June 21, 2026', '00:00', 'Estadio BBVA', 'Monterrey', 'F'),
  
  // June 21, 2026
  createMatch('H3', 'esp', 'ksa', 'June 21, 2026', '12:00', 'Mercedes-Benz Stadium', 'Atlanta', 'H'),
  createMatch('G3', 'bel', 'irn', 'June 21, 2026', '15:00', 'SoFi Stadium', 'Los Angeles', 'G'),
  createMatch('H4', 'uru', 'cpv', 'June 21, 2026', '18:00', 'Hard Rock Stadium', 'Miami', 'H'),
  createMatch('G4', 'nzl', 'egy', 'June 21, 2026', '21:00', 'BC Place', 'Vancouver', 'G'),
  
  // June 22, 2026
  createMatch('J3', 'arg', 'aut', 'June 22, 2026', '13:00', 'AT&T Stadium', 'Dallas', 'J'),
  createMatch('I3', 'fra', 'fpo2', 'June 22, 2026', '17:00', 'Lincoln Financial Field', 'Philadelphia', 'I'),
  createMatch('I4', 'nor', 'sen', 'June 22, 2026', '20:00', 'MetLife Stadium', 'New York', 'I'),
  createMatch('J4', 'jor', 'alg', 'June 22, 2026', '23:00', 'Levi\'s Stadium', 'San Francisco', 'J'),
  
  // June 23, 2026
  createMatch('K3', 'por', 'uzb', 'June 23, 2026', '13:00', 'NRG Stadium', 'Houston', 'K'),
  createMatch('L3', 'eng', 'gha', 'June 23, 2026', '16:00', 'Gillette Stadium', 'Boston', 'L'),
  createMatch('L4', 'pan', 'cro', 'June 23, 2026', '19:00', 'BMO Field', 'Toronto', 'L'),
  createMatch('K4', 'col', 'fpo1', 'June 23, 2026', '22:00', 'Estadio Akron', 'Guadalajara', 'K'),
  
  // ============ MATCHDAY 3 (Simultaneous kick-offs per group) ============
  
  // June 24, 2026
  createMatch('B5', 'sui', 'can', 'June 24, 2026', '15:00', 'BC Place', 'Vancouver', 'B'),
  createMatch('B6', 'uefa', 'qat', 'June 24, 2026', '15:00', 'Lumen Field', 'Seattle', 'B'),
  createMatch('C5', 'sco', 'bra', 'June 24, 2026', '18:00', 'Hard Rock Stadium', 'Miami', 'C'),
  createMatch('C6', 'mar', 'hai', 'June 24, 2026', '18:00', 'Mercedes-Benz Stadium', 'Atlanta', 'C'),
  createMatch('A5', 'uefd', 'mex', 'June 24, 2026', '21:00', 'Estadio Azteca', 'Mexico City', 'A'),
  createMatch('A6', 'rsa', 'kor', 'June 24, 2026', '21:00', 'Estadio BBVA', 'Monterrey', 'A'),
  
  // June 25, 2026
  createMatch('E5', 'ecu', 'ger', 'June 25, 2026', '16:00', 'MetLife Stadium', 'New York', 'E'),
  createMatch('E6', 'cur', 'civ', 'June 25, 2026', '16:00', 'Lincoln Financial Field', 'Philadelphia', 'E'),
  createMatch('F5', 'jpn', 'uefb', 'June 25, 2026', '19:00', 'AT&T Stadium', 'Dallas', 'F'),
  createMatch('F6', 'tun', 'ned', 'June 25, 2026', '19:00', 'Arrowhead Stadium', 'Kansas City', 'F'),
  createMatch('D5', 'uefc', 'usa', 'June 25, 2026', '22:00', 'SoFi Stadium', 'Los Angeles', 'D'),
  createMatch('D6', 'par', 'aus', 'June 25, 2026', '22:00', 'Levi\'s Stadium', 'San Francisco', 'D'),
  
  // June 26, 2026
  createMatch('I5', 'nor', 'fra', 'June 26, 2026', '15:00', 'Gillette Stadium', 'Boston', 'I'),
  createMatch('I6', 'sen', 'fpo2', 'June 26, 2026', '15:00', 'BMO Field', 'Toronto', 'I'),
  createMatch('H5', 'cpv', 'ksa', 'June 26, 2026', '20:00', 'NRG Stadium', 'Houston', 'H'),
  createMatch('H6', 'uru', 'esp', 'June 26, 2026', '20:00', 'Estadio Akron', 'Guadalajara', 'H'),
  createMatch('G5', 'egy', 'irn', 'June 26, 2026', '23:00', 'Lumen Field', 'Seattle', 'G'),
  createMatch('G6', 'nzl', 'bel', 'June 26, 2026', '23:00', 'BC Place', 'Vancouver', 'G'),
  
  // June 27, 2026
  createMatch('K5', 'col', 'por', 'June 27, 2026', '19:30', 'Hard Rock Stadium', 'Miami', 'K'),
  createMatch('K6', 'fpo1', 'uzb', 'June 27, 2026', '19:30', 'Mercedes-Benz Stadium', 'Atlanta', 'K'),
  createMatch('L5', 'pan', 'eng', 'June 27, 2026', '17:00', 'MetLife Stadium', 'New York', 'L'),
  createMatch('L6', 'cro', 'gha', 'June 27, 2026', '17:00', 'Lincoln Financial Field', 'Philadelphia', 'L'),
  createMatch('J5', 'alg', 'aut', 'June 27, 2026', '22:00', 'Arrowhead Stadium', 'Kansas City', 'J'),
  createMatch('J6', 'jor', 'arg', 'June 27, 2026', '22:00', 'AT&T Stadium', 'Dallas', 'J'),
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
