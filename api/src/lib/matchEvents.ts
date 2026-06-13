// In-memory pub/sub for live_matches changes.
//
// Drives the SSE endpoint at GET /api/matches/stream so client UIs see
// goals as soon as the admin (or runSync) writes them, instead of having
// to wait for a manual refresh / next periodic refetch.
//
// In-memory is fine for our single-instance Northflank deployment. If we
// ever scale to multiple replicas, swap this for Postgres LISTEN/NOTIFY
// (postgres.js supports it) so a write on one instance fans out to SSE
// subscribers on every instance. Until then, simpler is better.

export interface MatchGoal {
  id: string;
  minute: number;
  player_name: string;
  team_side: 'home' | 'away';
  goal_type?: string | null;
}

export interface MatchBooking {
  id: string;
  minute: number;
  player_name: string;
  team_side: 'home' | 'away';
  card_type: 'yellow' | 'second_yellow' | 'red';
}

export interface LiveMatchEvent {
  match_id: string;
  api_match_id: number | null;
  home_team_name: string;
  home_team_code: string;
  away_team_name: string;
  away_team_code: string;
  home_score: number | null;
  away_score: number | null;
  match_date: string;
  venue: string | null;
  city: string | null;
  stage: string;
  group_name: string | null;
  status: string;
  manual_override: boolean;
  last_updated: string;
  goals?: MatchGoal[];
  bookings?: MatchBooking[];
}

type Subscriber = (event: LiveMatchEvent) => void;
const subscribers = new Set<Subscriber>();

export function subscribeMatchEvents(cb: Subscriber): () => void {
  subscribers.add(cb);
  return () => {
    subscribers.delete(cb);
  };
}

export function emitMatchEvent(event: LiveMatchEvent): void {
  for (const cb of subscribers) {
    try {
      cb(event);
    } catch (err) {
      // A single broken subscriber must not block the rest of the fan-out.
      console.error("[matchEvents] subscriber threw:", err);
    }
  }
}

export function subscriberCount(): number {
  return subscribers.size;
}
