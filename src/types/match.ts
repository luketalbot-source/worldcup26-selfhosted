export interface Team {
  id: string;
  name: string;
  code: string;
  flag: string;
  group: string;
}

export interface Match {
  id: string;
  homeTeam: Team;
  awayTeam: Team;
  date: string;
  time: string;
  venue: string;
  city: string;
  stage: 'group' | 'round32' | 'round16' | 'quarter' | 'semi' | 'third' | 'final';
  group?: string;
  homeScore?: number;
  awayScore?: number;
  status: 'upcoming' | 'live' | 'finished';
}

export interface Prediction {
  matchId: string;
  homeScore: number;
  awayScore: number;
  timestamp: string;
}

export interface GroupStanding {
  team: Team;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  points: number;
}
