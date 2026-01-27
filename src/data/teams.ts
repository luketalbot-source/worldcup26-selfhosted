import { Team } from '@/types/match';

export const teams: Team[] = [
  // Group A
  { id: 'usa', name: 'United States', code: 'USA', flag: '🇺🇸', group: 'A' },
  { id: 'mex', name: 'Mexico', code: 'MEX', flag: '🇲🇽', group: 'A' },
  { id: 'can', name: 'Canada', code: 'CAN', flag: '🇨🇦', group: 'A' },
  { id: 'col', name: 'Colombia', code: 'COL', flag: '🇨🇴', group: 'A' },
  
  // Group B
  { id: 'bra', name: 'Brazil', code: 'BRA', flag: '🇧🇷', group: 'B' },
  { id: 'arg', name: 'Argentina', code: 'ARG', flag: '🇦🇷', group: 'B' },
  { id: 'jpn', name: 'Japan', code: 'JPN', flag: '🇯🇵', group: 'B' },
  { id: 'kor', name: 'South Korea', code: 'KOR', flag: '🇰🇷', group: 'B' },
  
  // Group C
  { id: 'ger', name: 'Germany', code: 'GER', flag: '🇩🇪', group: 'C' },
  { id: 'fra', name: 'France', code: 'FRA', flag: '🇫🇷', group: 'C' },
  { id: 'esp', name: 'Spain', code: 'ESP', flag: '🇪🇸', group: 'C' },
  { id: 'ned', name: 'Netherlands', code: 'NED', flag: '🇳🇱', group: 'C' },
  
  // Group D
  { id: 'eng', name: 'England', code: 'ENG', flag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿', group: 'D' },
  { id: 'por', name: 'Portugal', code: 'POR', flag: '🇵🇹', group: 'D' },
  { id: 'bel', name: 'Belgium', code: 'BEL', flag: '🇧🇪', group: 'D' },
  { id: 'sen', name: 'Senegal', code: 'SEN', flag: '🇸🇳', group: 'D' },
  
  // Group E
  { id: 'ita', name: 'Italy', code: 'ITA', flag: '🇮🇹', group: 'E' },
  { id: 'uru', name: 'Uruguay', code: 'URU', flag: '🇺🇾', group: 'E' },
  { id: 'cro', name: 'Croatia', code: 'CRO', flag: '🇭🇷', group: 'E' },
  { id: 'mar', name: 'Morocco', code: 'MAR', flag: '🇲🇦', group: 'E' },
  
  // Group F
  { id: 'pol', name: 'Poland', code: 'POL', flag: '🇵🇱', group: 'F' },
  { id: 'den', name: 'Denmark', code: 'DEN', flag: '🇩🇰', group: 'F' },
  { id: 'sui', name: 'Switzerland', code: 'SUI', flag: '🇨🇭', group: 'F' },
  { id: 'aus', name: 'Australia', code: 'AUS', flag: '🇦🇺', group: 'F' },
];

export const getTeamById = (id: string): Team | undefined => {
  return teams.find(team => team.id === id);
};

export const getTeamsByGroup = (group: string): Team[] => {
  return teams.filter(team => team.group === group);
};
