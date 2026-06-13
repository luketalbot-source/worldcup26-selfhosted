import { useTranslation } from 'react-i18next';
import type { MatchGoal, MatchBooking } from '@/types/match';

// Shared goal-scorers + bookings overlay for the match cards (group and
// knockout). Two translucent boxes, each a two-column grid: home events
// right-aligned (toward the card centre), away left-aligned — same
// readable-on-flag styling the goals box always used. Extracted so the
// two card components don't duplicate this (the cards box was added
// June 13 alongside the own-goal fix).

// Small card pip. second_yellow = the yellow that became a red, so we
// show both pips — matches how broadcasts render a second booking.
const CardPips = ({ type }: { type: MatchBooking['card_type'] }) => {
  const yellow = <span className="inline-block w-2 h-3 rounded-[1px] bg-yellow-400 align-middle" />;
  const red = <span className="inline-block w-2 h-3 rounded-[1px] bg-red-600 align-middle" />;
  if (type === 'red') return red;
  if (type === 'second_yellow') {
    return (
      <span className="inline-flex items-center gap-0.5">
        {yellow}
        {red}
      </span>
    );
  }
  return yellow;
};

const goalSuffix = (g: MatchGoal, t: (k: string) => string): string => {
  const type = (g.goal_type ?? '').toUpperCase();
  if (type === 'OWN') return ` (${t('matchCard.ownGoal')})`;
  if (type === 'PENALTY') return ` (${t('matchCard.penalty')})`;
  return '';
};

interface MatchEventsProps {
  goals: MatchGoal[];
  bookings: MatchBooking[];
}

export const MatchEvents = ({ goals, bookings }: MatchEventsProps) => {
  const { t } = useTranslation();
  const hasGoals = goals.length > 0;
  const hasCards = bookings.length > 0;
  if (!hasGoals && !hasCards) return null;

  const homeGoals = goals.filter((g) => g.team_side === 'home');
  const awayGoals = goals.filter((g) => g.team_side === 'away');
  const homeCards = bookings.filter((b) => b.team_side === 'home');
  const awayCards = bookings.filter((b) => b.team_side === 'away');

  return (
    <div className="space-y-1.5 w-full max-w-md">
      {hasGoals && (
        <div className="bg-background/55 backdrop-blur-md rounded-xl px-4 py-2 shadow-md">
          <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs">
            <div className="text-right space-y-0.5 min-w-0">
              {homeGoals.map((g) => (
                <div key={g.id} className="truncate text-foreground">
                  <span className="font-medium">{g.player_name}</span>
                  <span className="text-muted-foreground">{goalSuffix(g, t)}</span>
                  <span className="font-mono text-muted-foreground ml-2">{g.minute}&prime;</span>
                </div>
              ))}
            </div>
            <div className="text-left space-y-0.5 min-w-0">
              {awayGoals.map((g) => (
                <div key={g.id} className="truncate text-foreground">
                  <span className="font-mono text-muted-foreground mr-2">{g.minute}&prime;</span>
                  <span className="font-medium">{g.player_name}</span>
                  <span className="text-muted-foreground">{goalSuffix(g, t)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {hasCards && (
        <div className="bg-background/55 backdrop-blur-md rounded-xl px-4 py-2 shadow-md">
          <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs">
            <div className="text-right space-y-0.5 min-w-0">
              {homeCards.map((b) => (
                <div key={b.id} className="truncate text-foreground flex items-center justify-end gap-1.5">
                  <span className="font-medium truncate">{b.player_name}</span>
                  <span className="font-mono text-muted-foreground">{b.minute}&prime;</span>
                  <CardPips type={b.card_type} />
                </div>
              ))}
            </div>
            <div className="text-left space-y-0.5 min-w-0">
              {awayCards.map((b) => (
                <div key={b.id} className="truncate text-foreground flex items-center gap-1.5">
                  <CardPips type={b.card_type} />
                  <span className="font-mono text-muted-foreground">{b.minute}&prime;</span>
                  <span className="font-medium truncate">{b.player_name}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
