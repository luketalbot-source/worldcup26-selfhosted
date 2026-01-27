import { Match } from '@/types/match';
import { getTeamById } from './teams';

// Placeholder team for TBD matches
const tbdTeam = (label: string) => ({
  id: `tbd-${label}`,
  name: label,
  code: 'TBD',
  flag: '🏳️',
  group: '',
});

export interface KnockoutMatch extends Omit<Match, 'group'> {
  bracketPosition: string;
  homeTeamSource?: string;
  awayTeamSource?: string;
}

// Round of 16 - 8 matches
export const round16Matches: KnockoutMatch[] = [
  {
    id: 'R16-1',
    homeTeam: tbdTeam('Winner A'),
    awayTeam: tbdTeam('Runner-up B'),
    homeTeamSource: '1A',
    awayTeamSource: '2B',
    date: 'June 28, 2026',
    time: '16:00',
    venue: 'MetLife Stadium',
    city: 'New York',
    stage: 'round16',
    status: 'upcoming',
    bracketPosition: 'R16-1',
  },
  {
    id: 'R16-2',
    homeTeam: tbdTeam('Winner C'),
    awayTeam: tbdTeam('Runner-up D'),
    homeTeamSource: '1C',
    awayTeamSource: '2D',
    date: 'June 28, 2026',
    time: '20:00',
    venue: 'SoFi Stadium',
    city: 'Los Angeles',
    stage: 'round16',
    status: 'upcoming',
    bracketPosition: 'R16-2',
  },
  {
    id: 'R16-3',
    homeTeam: tbdTeam('Winner B'),
    awayTeam: tbdTeam('Runner-up A'),
    homeTeamSource: '1B',
    awayTeamSource: '2A',
    date: 'June 29, 2026',
    time: '16:00',
    venue: 'AT&T Stadium',
    city: 'Dallas',
    stage: 'round16',
    status: 'upcoming',
    bracketPosition: 'R16-3',
  },
  {
    id: 'R16-4',
    homeTeam: tbdTeam('Winner D'),
    awayTeam: tbdTeam('Runner-up C'),
    homeTeamSource: '1D',
    awayTeamSource: '2C',
    date: 'June 29, 2026',
    time: '20:00',
    venue: 'Hard Rock Stadium',
    city: 'Miami',
    stage: 'round16',
    status: 'upcoming',
    bracketPosition: 'R16-4',
  },
  {
    id: 'R16-5',
    homeTeam: tbdTeam('Winner E'),
    awayTeam: tbdTeam('Runner-up F'),
    homeTeamSource: '1E',
    awayTeamSource: '2F',
    date: 'June 30, 2026',
    time: '16:00',
    venue: 'Mercedes-Benz Stadium',
    city: 'Atlanta',
    stage: 'round16',
    status: 'upcoming',
    bracketPosition: 'R16-5',
  },
  {
    id: 'R16-6',
    homeTeam: tbdTeam('Winner F'),
    awayTeam: tbdTeam('Runner-up E'),
    homeTeamSource: '1F',
    awayTeamSource: '2E',
    date: 'June 30, 2026',
    time: '20:00',
    venue: 'Levi\'s Stadium',
    city: 'San Francisco',
    stage: 'round16',
    status: 'upcoming',
    bracketPosition: 'R16-6',
  },
  {
    id: 'R16-7',
    homeTeam: tbdTeam('3rd Best A/B/C'),
    awayTeam: tbdTeam('3rd Best D/E/F'),
    homeTeamSource: '3ABC',
    awayTeamSource: '3DEF',
    date: 'July 1, 2026',
    time: '16:00',
    venue: 'NRG Stadium',
    city: 'Houston',
    stage: 'round16',
    status: 'upcoming',
    bracketPosition: 'R16-7',
  },
  {
    id: 'R16-8',
    homeTeam: tbdTeam('3rd Best A/B/C'),
    awayTeam: tbdTeam('3rd Best D/E/F'),
    homeTeamSource: '3ABC',
    awayTeamSource: '3DEF',
    date: 'July 1, 2026',
    time: '20:00',
    venue: 'Estadio Azteca',
    city: 'Mexico City',
    stage: 'round16',
    status: 'upcoming',
    bracketPosition: 'R16-8',
  },
];

// Quarter Finals - 4 matches
export const quarterFinalMatches: KnockoutMatch[] = [
  {
    id: 'QF-1',
    homeTeam: tbdTeam('Winner R16-1'),
    awayTeam: tbdTeam('Winner R16-2'),
    homeTeamSource: 'R16-1',
    awayTeamSource: 'R16-2',
    date: 'July 4, 2026',
    time: '16:00',
    venue: 'MetLife Stadium',
    city: 'New York',
    stage: 'quarter',
    status: 'upcoming',
    bracketPosition: 'QF-1',
  },
  {
    id: 'QF-2',
    homeTeam: tbdTeam('Winner R16-3'),
    awayTeam: tbdTeam('Winner R16-4'),
    homeTeamSource: 'R16-3',
    awayTeamSource: 'R16-4',
    date: 'July 4, 2026',
    time: '20:00',
    venue: 'SoFi Stadium',
    city: 'Los Angeles',
    stage: 'quarter',
    status: 'upcoming',
    bracketPosition: 'QF-2',
  },
  {
    id: 'QF-3',
    homeTeam: tbdTeam('Winner R16-5'),
    awayTeam: tbdTeam('Winner R16-6'),
    homeTeamSource: 'R16-5',
    awayTeamSource: 'R16-6',
    date: 'July 5, 2026',
    time: '16:00',
    venue: 'AT&T Stadium',
    city: 'Dallas',
    stage: 'quarter',
    status: 'upcoming',
    bracketPosition: 'QF-3',
  },
  {
    id: 'QF-4',
    homeTeam: tbdTeam('Winner R16-7'),
    awayTeam: tbdTeam('Winner R16-8'),
    homeTeamSource: 'R16-7',
    awayTeamSource: 'R16-8',
    date: 'July 5, 2026',
    time: '20:00',
    venue: 'Hard Rock Stadium',
    city: 'Miami',
    stage: 'quarter',
    status: 'upcoming',
    bracketPosition: 'QF-4',
  },
];

// Semi Finals - 2 matches
export const semiFinalMatches: KnockoutMatch[] = [
  {
    id: 'SF-1',
    homeTeam: tbdTeam('Winner QF-1'),
    awayTeam: tbdTeam('Winner QF-2'),
    homeTeamSource: 'QF-1',
    awayTeamSource: 'QF-2',
    date: 'July 8, 2026',
    time: '20:00',
    venue: 'MetLife Stadium',
    city: 'New York',
    stage: 'semi',
    status: 'upcoming',
    bracketPosition: 'SF-1',
  },
  {
    id: 'SF-2',
    homeTeam: tbdTeam('Winner QF-3'),
    awayTeam: tbdTeam('Winner QF-4'),
    homeTeamSource: 'QF-3',
    awayTeamSource: 'QF-4',
    date: 'July 9, 2026',
    time: '20:00',
    venue: 'AT&T Stadium',
    city: 'Dallas',
    stage: 'semi',
    status: 'upcoming',
    bracketPosition: 'SF-2',
  },
];

// Third Place Playoff
export const thirdPlaceMatch: KnockoutMatch = {
  id: 'THIRD',
  homeTeam: tbdTeam('Loser SF-1'),
  awayTeam: tbdTeam('Loser SF-2'),
  homeTeamSource: 'SF-1-L',
  awayTeamSource: 'SF-2-L',
  date: 'July 13, 2026',
  time: '16:00',
  venue: 'Hard Rock Stadium',
  city: 'Miami',
  stage: 'third',
  status: 'upcoming',
  bracketPosition: 'THIRD',
};

// Final
export const finalMatch: KnockoutMatch = {
  id: 'FINAL',
  homeTeam: tbdTeam('Winner SF-1'),
  awayTeam: tbdTeam('Winner SF-2'),
  homeTeamSource: 'SF-1',
  awayTeamSource: 'SF-2',
  date: 'July 19, 2026',
  time: '16:00',
  venue: 'MetLife Stadium',
  city: 'New York',
  stage: 'final',
  status: 'upcoming',
  bracketPosition: 'FINAL',
};

export const getAllKnockoutMatches = (): KnockoutMatch[] => [
  ...round16Matches,
  ...quarterFinalMatches,
  ...semiFinalMatches,
  thirdPlaceMatch,
  finalMatch,
];

export const getKnockoutMatchesByStage = (stage: string): KnockoutMatch[] => {
  switch (stage) {
    case 'round16':
      return round16Matches;
    case 'quarter':
      return quarterFinalMatches;
    case 'semi':
      return semiFinalMatches;
    case 'third':
      return [thirdPlaceMatch];
    case 'final':
      return [finalMatch];
    default:
      return [];
  }
};
