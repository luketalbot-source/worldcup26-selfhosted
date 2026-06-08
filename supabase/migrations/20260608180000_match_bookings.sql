-- Card/booking events per match.
--
-- Mirrors match_goals — football-data.org's tier-two response carries a
-- `bookings` array alongside `goals`, with the same shape (player +
-- minute + team) plus a `card` enum. We persist one row per booking so
-- the Stats tab can:
--   - count yellow / red totals tournament-wide
--   - surface the team with the worst discipline (most cards)
--   - show fastest red card or per-team breakdowns in the future
--
-- ON DELETE CASCADE matches the goals table so wiping a live_matches
-- row (e.g. the one-time fd-cl-* legacy cleanup we run on each extra-
-- match sync) doesn't leave orphan bookings behind.

CREATE TABLE IF NOT EXISTS public.match_bookings (
  id           UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id     TEXT         NOT NULL REFERENCES public.live_matches(match_id) ON DELETE CASCADE,
  -- Same 1..130 envelope as match_goals (regular time + ET + a bit of
  -- injury time at the back of ET). Admin can enter 47 for "45+2'".
  minute       INTEGER      NOT NULL CHECK (minute > 0 AND minute <= 130),
  player_name  TEXT         NOT NULL,
  team_side    TEXT         NOT NULL CHECK (team_side IN ('home', 'away')),
  -- 'yellow'        — straight yellow
  -- 'second_yellow' — second yellow → automatic red
  -- 'red'           — straight red
  -- For discipline counting we treat second_yellow as BOTH a yellow
  -- (the underlying card) and a red (the consequence), but at the
  -- storage layer we keep one row per discrete card event — FD reports
  -- the second yellow as its own booking row.
  card_type    TEXT         NOT NULL CHECK (card_type IN ('yellow', 'second_yellow', 'red')),
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_match_bookings_match_id_minute
  ON public.match_bookings (match_id, minute);
