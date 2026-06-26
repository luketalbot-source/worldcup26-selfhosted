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
  /** FD goal type: 'REGULAR' | 'OWN' | 'PENALTY' (null = treat as regular). */
  goal_type?: string | null;
}

export interface MatchBooking {
  id: string;
  minute: number;
  player_name: string;
  team_side: 'home' | 'away';
  card_type: 'yellow' | 'second_yellow' | 'red';
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
  // Penalty-shootout result (knockouts that went to PSO only). Both
  // null/undefined for regulation/ET-decided matches. Not used in
  // scoring — purely informational for the AET/PSO badge.
  penaltyHomeScore?: number | null;
  penaltyAwayScore?: number | null;
  // FD's duration enum, surfaced through the MatchesView mapping so
  // cards can render a small badge when the match needed ET / PSO.
  duration?: 'REGULAR' | 'EXTRA_TIME' | 'PENALTY_SHOOTOUT' | null;
  status: 'upcoming' | 'live' | 'finished';
  goals?: MatchGoal[];
  bookings?: MatchBooking[];
}

export interface Prediction {
  matchId: string;
  homeScore: number;
  awayScore: number;
  // Predicted penalty-shootout score (knockout level predictions only).
  penaltyHomeScore?: number | null;
  penaltyAwayScore?: number | null;
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
