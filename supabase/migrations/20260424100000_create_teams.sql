-- public.teams — canonical list of FIFA World Cup 2026 teams, populated by
-- POST /api/admin/sync-matches from the football-data.org /competitions/WC/teams
-- endpoint. Drives the frontend's team roster and group layout; replaces the
-- static src/data/teams.ts file that had Group X test data and TBD placeholders.

CREATE TABLE IF NOT EXISTS public.teams (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tla          TEXT NOT NULL UNIQUE,      -- three-letter abbreviation, e.g. "MEX"
  name         TEXT NOT NULL,             -- full name, e.g. "Mexico"
  short_name   TEXT,                      -- e.g. "Mexico" (often same as name)
  crest_url    TEXT,                      -- IdP-hosted flag/crest image
  group_name   TEXT,                      -- "A".."L" derived from the team's group-stage fixtures; null if not yet grouped
  fd_team_id   INTEGER UNIQUE,            -- football-data.org team id for idempotent upsert
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_teams_group ON public.teams (group_name);
CREATE INDEX IF NOT EXISTS idx_teams_tla   ON public.teams (tla);

-- No RLS: team roster is public and the API reads it as the worldcup26
-- superuser anyway. Admins write via sync-matches; no direct user writes.
