export interface Team {
  id: string;
  name: string;
  code: string;
  flag: string;
  group: string;
}

export interface MatchGoal {
  id: string;
  minute: number;
  player_name: string;
  team_side: 'home' | 'away';
}

export interface Match {
  id: string;
  homeTeam: Team;
  awayTeam: Team;
  /** Human-readable date, e.g. "June 11, 2026" (legacy static format, ET). */
  date: string;
  /** 24h time, e.g. "15:00" (legacy static format, ET). */
  time: string;
  /**
   * UTC ISO-8601 kick-off. Set when the fixture comes from the API. When
   * present, useMatchTime will format this directly in the user's TZ
   * (ignoring the legacy date/time fields) and produce a TZ-aware string
   * like "Jun 11, 2026" / "20:00 BST". Optional for backward compat with
   * the static data files.
   */
  dateIso?: string;
  venue: string;
  city: string;
  stage: 'group' | 'round32' | 'round16' | 'quarter' | 'semi' | 'third' | 'final';
  group?: string;
  homeScore?: number;
  awayScore?: number;
  status: 'upcoming' | 'live' | 'finished';
  goals?: MatchGoal[];
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
