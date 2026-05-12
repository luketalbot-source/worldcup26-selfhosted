-- Player rosters for the 48 qualified teams.
--
-- Source of truth for boost picks of type 'player' (Golden Boot, Golden
-- Ball, Golden Glove, Young Player, plus tenant custom boosts). The old
-- free-text input let users mistype "Mbappe" / "Mbappé" / "K. Mbappé"
-- and silently fail scoring at result time because the admin had typed
-- one canonical spelling and the equality join missed everything else.
--
-- Strategy: admin imports rosters once (from Transfermarkt / Wikipedia
-- / FIFA's eventual list), then user + admin both pick from the exact
-- same dropdown of `id`s — exact-match scoring becomes trivial.
--
-- football-data.org's free tier doesn't carry national-team rosters, so
-- there is no automatic sync path; this table is admin-curated until
-- FIFA publishes the official 26-player squads after their May deadline.

CREATE TABLE IF NOT EXISTS public.live_players (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Joins to live_matches.home_team_code / away_team_code. NOT a foreign
  -- key on purpose: codes are stable but the team's group/match rows
  -- come and go as FD syncs; we don't want roster import to break when
  -- a team isn't in live_matches yet.
  team_code     TEXT NOT NULL,

  -- Canonical display name. What every UI shows and what the scoring
  -- join compares against, so it must be the one true spelling per
  -- player. UNIQUE-per-team-code below makes re-imports idempotent.
  full_name     TEXT NOT NULL,

  -- Lowercased, accent-stripped form. Computed at import time on the
  -- backend (Postgres `unaccent` would require an extension, and the
  -- typescript path keeps it consistent with however the frontend
  -- normalises a search query). Indexed for typeahead.
  searchable    TEXT NOT NULL,

  -- Optional metadata. Help disambiguate (e.g. two players named "Silva")
  -- in the picker UI; not required for scoring.
  position      TEXT,          -- 'GK' | 'DF' | 'MF' | 'FW' | free-text
  shirt_number  INT,
  date_of_birth DATE,

  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Lets POST /admin/players/import use ON CONFLICT (team_code,
  -- full_name) DO UPDATE for idempotent re-imports.
  UNIQUE (team_code, full_name)
);

CREATE INDEX IF NOT EXISTS idx_live_players_team_code
  ON public.live_players (team_code);

CREATE INDEX IF NOT EXISTS idx_live_players_searchable
  ON public.live_players (searchable);
