-- Penalty-shootout result + match duration on live_matches.
--
-- FD's match payload already exposes everything we need:
--   match.score.duration   ∈ REGULAR | EXTRA_TIME | PENALTY_SHOOTOUT
--   match.score.penalties  { home, away }   (set only when duration = PSO)
--
-- We've been ignoring both because the regular-time / ET score in
-- `home_score`/`away_score` is enough for our scoring rules (2:2 AET
-- with a 5-4 shootout is still scored as a 2-2 prediction). But the
-- UI was hiding "team X advanced on penalties" entirely, which felt
-- wrong on knockout cards once the tournament's actually live.
--
-- Three new columns, all nullable so unplayed matches stay null and
-- existing rows survive the ALTER unchanged. `manual_override` semantics
-- automatically apply: a row the admin's edited won't have these
-- overwritten by the next FD sync.

ALTER TABLE public.live_matches
  ADD COLUMN IF NOT EXISTS penalty_home_score INTEGER,
  ADD COLUMN IF NOT EXISTS penalty_away_score INTEGER,
  -- FD ships this as an upper-case enum; we store the raw string so
  -- the value round-trips losslessly and the frontend does the
  -- presentation mapping (REGULAR → no badge, EXTRA_TIME → "AET",
  -- PENALTY_SHOOTOUT → "PSO" + penalty score).
  ADD COLUMN IF NOT EXISTS duration TEXT;
