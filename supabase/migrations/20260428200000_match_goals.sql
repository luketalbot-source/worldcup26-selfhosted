-- Goal scorers per match.
--
-- Football-data.org's tier we're on returns score totals but not the
-- individual goal events (scorer, minute, type). Surfacing scorers on the
-- match card matters for engagement — fans want to see "17' Kane" on a
-- finished card the same way Sofascore or Flashscore does it. So we
-- maintain this list manually via the admin Matches editor.
--
-- One row per goal. ON DELETE CASCADE so wiping a live_matches row
-- (e.g. the one-time fd-cl-* legacy cleanup we run on each extra-match
-- sync) doesn't leave orphan goals behind.

CREATE TABLE IF NOT EXISTS public.match_goals (
  id           UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id     TEXT         NOT NULL REFERENCES public.live_matches(match_id) ON DELETE CASCADE,
  -- 1..130 covers regular time (90), extra time (120), and a couple of
  -- minutes of injury time at the end of ET. We don't model 45+x notation
  -- separately — admin can just enter 47 for "45+2'".
  minute       INTEGER      NOT NULL CHECK (minute > 0 AND minute <= 130),
  player_name  TEXT         NOT NULL,
  team_side    TEXT         NOT NULL CHECK (team_side IN ('home', 'away')),
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_match_goals_match_id_minute
  ON public.match_goals (match_id, minute);
