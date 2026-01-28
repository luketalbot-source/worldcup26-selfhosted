import { Team } from '@/types/match';

export const teams: Team[] = [
  // Group A - Mexico City/Guadalajara
  { id: 'mex', name: 'Mexico', code: 'MEX', flag: '🇲🇽', group: 'A' },
  { id: 'rsa', name: 'South Africa', code: 'RSA', flag: '🇿🇦', group: 'A' },
  { id: 'kor', name: 'South Korea', code: 'KOR', flag: '🇰🇷', group: 'A' },
  { id: 'uefd', name: 'UEFA Playoff D', code: 'TBD', flag: '🏳️', group: 'A' },
  
  // Group B - Toronto/Vancouver
  { id: 'can', name: 'Canada', code: 'CAN', flag: '🇨🇦', group: 'B' },
  { id: 'uefa', name: 'UEFA Playoff A', code: 'TBD', flag: '🏳️', group: 'B' },
  { id: 'qat', name: 'Qatar', code: 'QAT', flag: '🇶🇦', group: 'B' },
  { id: 'sui', name: 'Switzerland', code: 'SUI', flag: '🇨🇭', group: 'B' },
  
  // Group C - Los Angeles/San Francisco
  { id: 'bra', name: 'Brazil', code: 'BRA', flag: '🇧🇷', group: 'C' },
  { id: 'mar', name: 'Morocco', code: 'MAR', flag: '🇲🇦', group: 'C' },
  { id: 'hai', name: 'Haiti', code: 'HAI', flag: '🇭🇹', group: 'C' },
  { id: 'sco', name: 'Scotland', code: 'SCO', flag: '🏴󠁧󠁢󠁳󠁣󠁴󠁿', group: 'C' },
  
  // Group D - Dallas/Houston
  { id: 'usa', name: 'United States', code: 'USA', flag: '🇺🇸', group: 'D' },
  { id: 'par', name: 'Paraguay', code: 'PAR', flag: '🇵🇾', group: 'D' },
  { id: 'aus', name: 'Australia', code: 'AUS', flag: '🇦🇺', group: 'D' },
  { id: 'uefc', name: 'UEFA Playoff C', code: 'TBD', flag: '🏳️', group: 'D' },
  
  // Group E - Atlanta/Miami
  { id: 'ger', name: 'Germany', code: 'GER', flag: '🇩🇪', group: 'E' },
  { id: 'cur', name: 'Curaçao', code: 'CUW', flag: '🇨🇼', group: 'E' },
  { id: 'civ', name: 'Ivory Coast', code: 'CIV', flag: '🇨🇮', group: 'E' },
  { id: 'ecu', name: 'Ecuador', code: 'ECU', flag: '🇪🇨', group: 'E' },
  
  // Group F - New York/Philadelphia
  { id: 'ned', name: 'Netherlands', code: 'NED', flag: '🇳🇱', group: 'F' },
  { id: 'jpn', name: 'Japan', code: 'JPN', flag: '🇯🇵', group: 'F' },
  { id: 'uefb', name: 'UEFA Playoff B', code: 'TBD', flag: '🏳️', group: 'F' },
  { id: 'tun', name: 'Tunisia', code: 'TUN', flag: '🇹🇳', group: 'F' },
  
  // Group G - Seattle/San Francisco
  { id: 'bel', name: 'Belgium', code: 'BEL', flag: '🇧🇪', group: 'G' },
  { id: 'egy', name: 'Egypt', code: 'EGY', flag: '🇪🇬', group: 'G' },
  { id: 'irn', name: 'Iran', code: 'IRN', flag: '🇮🇷', group: 'G' },
  { id: 'nzl', name: 'New Zealand', code: 'NZL', flag: '🇳🇿', group: 'G' },
  
  // Group H - Kansas City/Dallas
  { id: 'esp', name: 'Spain', code: 'ESP', flag: '🇪🇸', group: 'H' },
  { id: 'cpv', name: 'Cape Verde', code: 'CPV', flag: '🇨🇻', group: 'H' },
  { id: 'ksa', name: 'Saudi Arabia', code: 'KSA', flag: '🇸🇦', group: 'H' },
  { id: 'uru', name: 'Uruguay', code: 'URU', flag: '🇺🇾', group: 'H' },
  
  // Group I - Boston/Philadelphia
  { id: 'fra', name: 'France', code: 'FRA', flag: '🇫🇷', group: 'I' },
  { id: 'sen', name: 'Senegal', code: 'SEN', flag: '🇸🇳', group: 'I' },
  { id: 'fpo2', name: 'FIFA Playoff 2', code: 'TBD', flag: '🏳️', group: 'I' },
  { id: 'nor', name: 'Norway', code: 'NOR', flag: '🇳🇴', group: 'I' },
  
  // Group J - Miami/Atlanta
  { id: 'arg', name: 'Argentina', code: 'ARG', flag: '🇦🇷', group: 'J' },
  { id: 'alg', name: 'Algeria', code: 'ALG', flag: '🇩🇿', group: 'J' },
  { id: 'aut', name: 'Austria', code: 'AUT', flag: '🇦🇹', group: 'J' },
  { id: 'jor', name: 'Jordan', code: 'JOR', flag: '🇯🇴', group: 'J' },
  
  // Group K - Los Angeles/Seattle
  { id: 'por', name: 'Portugal', code: 'POR', flag: '🇵🇹', group: 'K' },
  { id: 'fpo1', name: 'FIFA Playoff 1', code: 'TBD', flag: '🏳️', group: 'K' },
  { id: 'uzb', name: 'Uzbekistan', code: 'UZB', flag: '🇺🇿', group: 'K' },
  { id: 'col', name: 'Colombia', code: 'COL', flag: '🇨🇴', group: 'K' },
  
  // Group L - New York/Houston
  { id: 'eng', name: 'England', code: 'ENG', flag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿', group: 'L' },
  { id: 'cro', name: 'Croatia', code: 'CRO', flag: '🇭🇷', group: 'L' },
  { id: 'gha', name: 'Ghana', code: 'GHA', flag: '🇬🇭', group: 'L' },
  { id: 'pan', name: 'Panama', code: 'PAN', flag: '🇵🇦', group: 'L' },
  
  // Test teams (Group X - for testing purposes)
  { id: 'ita', name: 'Italy', code: 'ITA', flag: '🇮🇹', group: 'X' },
  { id: 'por', name: 'Portugal', code: 'POR', flag: '🇵🇹', group: 'X' },
  { id: 'ned', name: 'Netherlands', code: 'NED', flag: '🇳🇱', group: 'X' },
  { id: 'bel', name: 'Belgium', code: 'BEL', flag: '🇧🇪', group: 'X' },
  { id: 'ger_x', name: 'Germany', code: 'GER', flag: '🇩🇪', group: 'X' },
  { id: 'fra_x', name: 'France', code: 'FRA', flag: '🇫🇷', group: 'X' },
  { id: 'eng_x', name: 'England', code: 'ENG', flag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿', group: 'X' },
  { id: 'bra_x', name: 'Brazil', code: 'BRA', flag: '🇧🇷', group: 'X' },
  { id: 'esp_x', name: 'Spain', code: 'ESP', flag: '🇪🇸', group: 'X' },
  { id: 'arg_x', name: 'Argentina', code: 'ARG', flag: '🇦🇷', group: 'X' },
];

export const getTeamById = (id: string): Team | undefined => {
  return teams.find(team => team.id === id);
};

export const getTeamsByGroup = (group: string): Team[] => {
  return teams.filter(team => team.group === group);
};
