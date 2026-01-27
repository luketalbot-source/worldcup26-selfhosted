import { Match } from '@/types/match';

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

// Round of 32 - 16 matches (June 28 - July 3, 2026)
// All times in ET (Eastern Time)
// Match numbers M73-M88
export const round32Matches: KnockoutMatch[] = [
  // M73 - June 28, 2026 - 15:00 ET
  {
    id: 'M73',
    homeTeam: tbdTeam('2A'),
    awayTeam: tbdTeam('2B'),
    homeTeamSource: '2A',
    awayTeamSource: '2B',
    date: 'June 28, 2026',
    time: '15:00',
    venue: 'SoFi Stadium / Los Angeles',
    city: 'Los Angeles',
    stage: 'round32',
    status: 'upcoming',
    bracketPosition: 'M73',
  },
  // M76 - June 29, 2026 - 13:00 ET
  {
    id: 'M76',
    homeTeam: tbdTeam('1C'),
    awayTeam: tbdTeam('2F'),
    homeTeamSource: '1C',
    awayTeamSource: '2F',
    date: 'June 29, 2026',
    time: '13:00',
    venue: 'NRG Stadium / Houston',
    city: 'Houston',
    stage: 'round32',
    status: 'upcoming',
    bracketPosition: 'M76',
  },
  // M74 - June 29, 2026 - 16:30 ET
  {
    id: 'M74',
    homeTeam: tbdTeam('1E'),
    awayTeam: tbdTeam('3A/B/C/D/F'),
    homeTeamSource: '1E',
    awayTeamSource: '3ABCDF',
    date: 'June 29, 2026',
    time: '16:30',
    venue: 'Gillette Stadium / Foxborough',
    city: 'Foxborough',
    stage: 'round32',
    status: 'upcoming',
    bracketPosition: 'M74',
  },
  // M75 - June 29, 2026 - 21:00 ET
  {
    id: 'M75',
    homeTeam: tbdTeam('1F'),
    awayTeam: tbdTeam('2C'),
    homeTeamSource: '1F',
    awayTeamSource: '2C',
    date: 'June 29, 2026',
    time: '21:00',
    venue: 'Estadio BBVA / Monterrey',
    city: 'Monterrey',
    stage: 'round32',
    status: 'upcoming',
    bracketPosition: 'M75',
  },
  // M78 - June 30, 2026 - 13:00 ET
  {
    id: 'M78',
    homeTeam: tbdTeam('2E'),
    awayTeam: tbdTeam('2I'),
    homeTeamSource: '2E',
    awayTeamSource: '2I',
    date: 'June 30, 2026',
    time: '13:00',
    venue: 'AT&T Stadium / Dallas',
    city: 'Dallas',
    stage: 'round32',
    status: 'upcoming',
    bracketPosition: 'M78',
  },
  // M77 - June 30, 2026 - 17:00 ET
  {
    id: 'M77',
    homeTeam: tbdTeam('1I'),
    awayTeam: tbdTeam('3C/D/F/G/H'),
    homeTeamSource: '1I',
    awayTeamSource: '3CDFGH',
    date: 'June 30, 2026',
    time: '17:00',
    venue: 'MetLife Stadium / New York',
    city: 'New York',
    stage: 'round32',
    status: 'upcoming',
    bracketPosition: 'M77',
  },
  // M79 - June 30, 2026 - 21:00 ET
  {
    id: 'M79',
    homeTeam: tbdTeam('1A'),
    awayTeam: tbdTeam('3C/E/F/H/I'),
    homeTeamSource: '1A',
    awayTeamSource: '3CEFHI',
    date: 'June 30, 2026',
    time: '21:00',
    venue: 'Estadio Azteca / Mexico City',
    city: 'Mexico City',
    stage: 'round32',
    status: 'upcoming',
    bracketPosition: 'M79',
  },
  // M80 - July 1, 2026 - 12:00 ET
  {
    id: 'M80',
    homeTeam: tbdTeam('1L'),
    awayTeam: tbdTeam('3E/H/I/J/K'),
    homeTeamSource: '1L',
    awayTeamSource: '3EHIJK',
    date: 'July 1, 2026',
    time: '12:00',
    venue: 'Mercedes-Benz Stadium / Atlanta',
    city: 'Atlanta',
    stage: 'round32',
    status: 'upcoming',
    bracketPosition: 'M80',
  },
  // M82 - July 1, 2026 - 16:00 ET
  {
    id: 'M82',
    homeTeam: tbdTeam('1G'),
    awayTeam: tbdTeam('3A/E/H/I/J'),
    homeTeamSource: '1G',
    awayTeamSource: '3AEHIJ',
    date: 'July 1, 2026',
    time: '16:00',
    venue: 'Lumen Field / Seattle',
    city: 'Seattle',
    stage: 'round32',
    status: 'upcoming',
    bracketPosition: 'M82',
  },
  // M81 - July 1, 2026 - 20:00 ET
  {
    id: 'M81',
    homeTeam: tbdTeam('1D'),
    awayTeam: tbdTeam('3B/E/F/I/J'),
    homeTeamSource: '1D',
    awayTeamSource: '3BEFIJ',
    date: 'July 1, 2026',
    time: '20:00',
    venue: 'Levi\'s Stadium / San Francisco',
    city: 'San Francisco',
    stage: 'round32',
    status: 'upcoming',
    bracketPosition: 'M81',
  },
  // M88 - July 2, 2026 - 14:00 ET
  {
    id: 'M88',
    homeTeam: tbdTeam('2D'),
    awayTeam: tbdTeam('2G'),
    homeTeamSource: '2D',
    awayTeamSource: '2G',
    date: 'July 2, 2026',
    time: '14:00',
    venue: 'AT&T Stadium / Dallas',
    city: 'Dallas',
    stage: 'round32',
    status: 'upcoming',
    bracketPosition: 'M88',
  },
  // M84 - July 2, 2026 - 15:00 ET
  {
    id: 'M84',
    homeTeam: tbdTeam('1H'),
    awayTeam: tbdTeam('2J'),
    homeTeamSource: '1H',
    awayTeamSource: '2J',
    date: 'July 2, 2026',
    time: '15:00',
    venue: 'SoFi Stadium / Los Angeles',
    city: 'Los Angeles',
    stage: 'round32',
    status: 'upcoming',
    bracketPosition: 'M84',
  },
  // M83 - July 2, 2026 - 19:00 ET
  {
    id: 'M83',
    homeTeam: tbdTeam('2K'),
    awayTeam: tbdTeam('2L'),
    homeTeamSource: '2K',
    awayTeamSource: '2L',
    date: 'July 2, 2026',
    time: '19:00',
    venue: 'BMO Field / Toronto',
    city: 'Toronto',
    stage: 'round32',
    status: 'upcoming',
    bracketPosition: 'M83',
  },
  // M85 - July 2, 2026 - 23:00 ET
  {
    id: 'M85',
    homeTeam: tbdTeam('1B'),
    awayTeam: tbdTeam('3E/F/G/I/J'),
    homeTeamSource: '1B',
    awayTeamSource: '3EFGIJ',
    date: 'July 2, 2026',
    time: '23:00',
    venue: 'BC Place / Vancouver',
    city: 'Vancouver',
    stage: 'round32',
    status: 'upcoming',
    bracketPosition: 'M85',
  },
  // M86 - July 3, 2026 - 18:00 ET
  {
    id: 'M86',
    homeTeam: tbdTeam('1J'),
    awayTeam: tbdTeam('2H'),
    homeTeamSource: '1J',
    awayTeamSource: '2H',
    date: 'July 3, 2026',
    time: '18:00',
    venue: 'Hard Rock Stadium / Miami',
    city: 'Miami',
    stage: 'round32',
    status: 'upcoming',
    bracketPosition: 'M86',
  },
  // M87 - July 3, 2026 - 21:30 ET
  {
    id: 'M87',
    homeTeam: tbdTeam('1K'),
    awayTeam: tbdTeam('3D/E/I/J/L'),
    homeTeamSource: '1K',
    awayTeamSource: '3DEIJL',
    date: 'July 3, 2026',
    time: '21:30',
    venue: 'Arrowhead Stadium / Kansas City',
    city: 'Kansas City',
    stage: 'round32',
    status: 'upcoming',
    bracketPosition: 'M87',
  },
];

// Round of 16 - 8 matches (July 4-7, 2026)
// Match numbers M89-M96
export const round16Matches: KnockoutMatch[] = [
  // M90 - July 4, 2026 - 13:00 ET
  {
    id: 'M90',
    homeTeam: tbdTeam('W M73'),
    awayTeam: tbdTeam('W M75'),
    homeTeamSource: 'M73',
    awayTeamSource: 'M75',
    date: 'July 4, 2026',
    time: '13:00',
    venue: 'NRG Stadium / Houston',
    city: 'Houston',
    stage: 'round16',
    status: 'upcoming',
    bracketPosition: 'M90',
  },
  // M89 - July 4, 2026 - 17:00 ET
  {
    id: 'M89',
    homeTeam: tbdTeam('W M74'),
    awayTeam: tbdTeam('W M77'),
    homeTeamSource: 'M74',
    awayTeamSource: 'M77',
    date: 'July 4, 2026',
    time: '17:00',
    venue: 'Lincoln Financial Field / Philadelphia',
    city: 'Philadelphia',
    stage: 'round16',
    status: 'upcoming',
    bracketPosition: 'M89',
  },
  // M91 - July 5, 2026 - 16:00 ET
  {
    id: 'M91',
    homeTeam: tbdTeam('W M76'),
    awayTeam: tbdTeam('W M78'),
    homeTeamSource: 'M76',
    awayTeamSource: 'M78',
    date: 'July 5, 2026',
    time: '16:00',
    venue: 'MetLife Stadium / New York',
    city: 'New York',
    stage: 'round16',
    status: 'upcoming',
    bracketPosition: 'M91',
  },
  // M92 - July 5, 2026 - 20:00 ET
  {
    id: 'M92',
    homeTeam: tbdTeam('W M79'),
    awayTeam: tbdTeam('W M80'),
    homeTeamSource: 'M79',
    awayTeamSource: 'M80',
    date: 'July 5, 2026',
    time: '20:00',
    venue: 'Estadio Azteca / Mexico City',
    city: 'Mexico City',
    stage: 'round16',
    status: 'upcoming',
    bracketPosition: 'M92',
  },
  // M93 - July 6, 2026 - 15:00 ET
  {
    id: 'M93',
    homeTeam: tbdTeam('W M83'),
    awayTeam: tbdTeam('W M84'),
    homeTeamSource: 'M83',
    awayTeamSource: 'M84',
    date: 'July 6, 2026',
    time: '15:00',
    venue: 'AT&T Stadium / Dallas',
    city: 'Dallas',
    stage: 'round16',
    status: 'upcoming',
    bracketPosition: 'M93',
  },
  // M94 - July 6, 2026 - 20:00 ET
  {
    id: 'M94',
    homeTeam: tbdTeam('W M81'),
    awayTeam: tbdTeam('W M82'),
    homeTeamSource: 'M81',
    awayTeamSource: 'M82',
    date: 'July 6, 2026',
    time: '20:00',
    venue: 'Lumen Field / Seattle',
    city: 'Seattle',
    stage: 'round16',
    status: 'upcoming',
    bracketPosition: 'M94',
  },
  // M95 - July 7, 2026 - 12:00 ET
  {
    id: 'M95',
    homeTeam: tbdTeam('W M86'),
    awayTeam: tbdTeam('W M88'),
    homeTeamSource: 'M86',
    awayTeamSource: 'M88',
    date: 'July 7, 2026',
    time: '12:00',
    venue: 'Mercedes-Benz Stadium / Atlanta',
    city: 'Atlanta',
    stage: 'round16',
    status: 'upcoming',
    bracketPosition: 'M95',
  },
  // M96 - July 7, 2026 - 16:00 ET
  {
    id: 'M96',
    homeTeam: tbdTeam('W M85'),
    awayTeam: tbdTeam('W M87'),
    homeTeamSource: 'M85',
    awayTeamSource: 'M87',
    date: 'July 7, 2026',
    time: '16:00',
    venue: 'BC Place / Vancouver',
    city: 'Vancouver',
    stage: 'round16',
    status: 'upcoming',
    bracketPosition: 'M96',
  },
];

// Quarter Finals - 4 matches (July 9-11, 2026)
// Match numbers M97-M100
export const quarterFinalMatches: KnockoutMatch[] = [
  // M97 - July 9, 2026 - 16:00 ET
  {
    id: 'M97',
    homeTeam: tbdTeam('W M89'),
    awayTeam: tbdTeam('W M90'),
    homeTeamSource: 'M89',
    awayTeamSource: 'M90',
    date: 'July 9, 2026',
    time: '16:00',
    venue: 'Gillette Stadium / Foxborough',
    city: 'Foxborough',
    stage: 'quarter',
    status: 'upcoming',
    bracketPosition: 'M97',
  },
  // M98 - July 10, 2026 - 15:00 ET
  {
    id: 'M98',
    homeTeam: tbdTeam('W M93'),
    awayTeam: tbdTeam('W M94'),
    homeTeamSource: 'M93',
    awayTeamSource: 'M94',
    date: 'July 10, 2026',
    time: '15:00',
    venue: 'SoFi Stadium / Los Angeles',
    city: 'Los Angeles',
    stage: 'quarter',
    status: 'upcoming',
    bracketPosition: 'M98',
  },
  // M99 - July 11, 2026 - 17:00 ET
  {
    id: 'M99',
    homeTeam: tbdTeam('W M91'),
    awayTeam: tbdTeam('W M92'),
    homeTeamSource: 'M91',
    awayTeamSource: 'M92',
    date: 'July 11, 2026',
    time: '17:00',
    venue: 'Hard Rock Stadium / Miami',
    city: 'Miami',
    stage: 'quarter',
    status: 'upcoming',
    bracketPosition: 'M99',
  },
  // M100 - July 11, 2026 - 21:00 ET
  {
    id: 'M100',
    homeTeam: tbdTeam('W M95'),
    awayTeam: tbdTeam('W M96'),
    homeTeamSource: 'M95',
    awayTeamSource: 'M96',
    date: 'July 11, 2026',
    time: '21:00',
    venue: 'Arrowhead Stadium / Kansas City',
    city: 'Kansas City',
    stage: 'quarter',
    status: 'upcoming',
    bracketPosition: 'M100',
  },
];

// Semi Finals - 2 matches (July 14-15, 2026)
// Match numbers M101-M102
export const semiFinalMatches: KnockoutMatch[] = [
  // M101 - July 14, 2026 - 15:00 ET
  {
    id: 'M101',
    homeTeam: tbdTeam('W M97'),
    awayTeam: tbdTeam('W M98'),
    homeTeamSource: 'M97',
    awayTeamSource: 'M98',
    date: 'July 14, 2026',
    time: '15:00',
    venue: 'AT&T Stadium / Dallas',
    city: 'Dallas',
    stage: 'semi',
    status: 'upcoming',
    bracketPosition: 'M101',
  },
  // M102 - July 15, 2026 - 15:00 ET
  {
    id: 'M102',
    homeTeam: tbdTeam('W M99'),
    awayTeam: tbdTeam('W M100'),
    homeTeamSource: 'M99',
    awayTeamSource: 'M100',
    date: 'July 15, 2026',
    time: '15:00',
    venue: 'Mercedes-Benz Stadium / Atlanta',
    city: 'Atlanta',
    stage: 'semi',
    status: 'upcoming',
    bracketPosition: 'M102',
  },
];

// Third Place Playoff (July 18, 2026)
// Match M103
export const thirdPlaceMatch: KnockoutMatch = {
  id: 'M103',
  homeTeam: tbdTeam('L M101'),
  awayTeam: tbdTeam('L M102'),
  homeTeamSource: 'M101-L',
  awayTeamSource: 'M102-L',
  date: 'July 18, 2026',
  time: '17:00',
  venue: 'Hard Rock Stadium / Miami',
  city: 'Miami',
  stage: 'third',
  status: 'upcoming',
  bracketPosition: 'M103',
};

// Final (July 19, 2026)
// Match M104
export const finalMatch: KnockoutMatch = {
  id: 'M104',
  homeTeam: tbdTeam('W M101'),
  awayTeam: tbdTeam('W M102'),
  homeTeamSource: 'M101',
  awayTeamSource: 'M102',
  date: 'July 19, 2026',
  time: '15:00',
  venue: 'MetLife Stadium / New York',
  city: 'New York',
  stage: 'final',
  status: 'upcoming',
  bracketPosition: 'M104',
};

export const getAllKnockoutMatches = (): KnockoutMatch[] => [
  ...round32Matches,
  ...round16Matches,
  ...quarterFinalMatches,
  ...semiFinalMatches,
  thirdPlaceMatch,
  finalMatch,
];

export const getKnockoutMatchesByStage = (stage: string): KnockoutMatch[] => {
  switch (stage) {
    case 'round32':
      return round32Matches;
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
