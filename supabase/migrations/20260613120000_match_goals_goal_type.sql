-- Goal type on match_goals (REGULAR | OWN | PENALTY), straight from
-- football-data.org's goal.type.
--
-- Two reasons it landed (June 13, after USA 4-1 Paraguay showed only 3
-- of the 4 USA goals):
--   1. Own goals were being attributed to the SCORER's team, not the
--      beneficiary — FD's USA opener had a 7' own goal by a Paraguay
--      player that counts for the USA. The sync now flips the side for
--      OWN goals; storing the type lets the card label it "(OG)" so a
--      Paraguay name on the USA side reads correctly.
--   2. Lets the match card distinguish penalties too.
--
-- Nullable: pre-existing rows (and any future FD goal without a type)
-- are treated as REGULAR by the UI.

ALTER TABLE public.match_goals
  ADD COLUMN IF NOT EXISTS goal_type TEXT;
