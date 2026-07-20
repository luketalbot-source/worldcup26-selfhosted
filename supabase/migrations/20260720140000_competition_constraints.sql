-- Multi-competition platform, Phase C: constraints + indexes.
--
-- ⚠️ DEPLOY ORDER IS LOAD-BEARING: apply ONLY after the Phase B code
-- (competition-aware sync writing competition_id explicitly, teams upsert
-- with no hardcoded ON CONFLICT target) is deployed and verified. The old
-- code's `ON CONFLICT (tla)` team upsert errors once teams_tla_key drops.

-- Lock in attribution: everything competition-shaped must be attributed.
ALTER TABLE public.live_matches ALTER COLUMN competition_id SET NOT NULL;
ALTER TABLE public.teams        ALTER COLUMN competition_id SET NOT NULL;
ALTER TABLE public.boost_awards ALTER COLUMN competition_id SET NOT NULL;
ALTER TABLE public.live_players ALTER COLUMN competition_id SET NOT NULL;

-- Drop the Phase A "stray old-code insert" defaults — the generalized sync
-- stamps competition_id explicitly, and a silent default would now mask
-- attribution bugs.
ALTER TABLE public.live_matches ALTER COLUMN competition_id DROP DEFAULT;
ALTER TABLE public.teams        ALTER COLUMN competition_id DROP DEFAULT;
ALTER TABLE public.boost_awards ALTER COLUMN competition_id DROP DEFAULT;
ALTER TABLE public.live_players ALTER COLUMN competition_id DROP DEFAULT;

-- teams: global uniqueness → per-competition. A club playing in both CL and
-- Bundesliga is two rows (one per competition), each synced from its own
-- competition's /teams payload.
ALTER TABLE public.teams DROP CONSTRAINT IF EXISTS teams_tla_key;
ALTER TABLE public.teams DROP CONSTRAINT IF EXISTS teams_fd_team_id_key;
ALTER TABLE public.teams ADD CONSTRAINT teams_competition_tla_key UNIQUE (competition_id, tla);
ALTER TABLE public.teams ADD CONSTRAINT teams_competition_fd_team_id_key UNIQUE (competition_id, fd_team_id);

-- live_players: squads are per-competition registrations (Bayern's CL and
-- BL1 squads genuinely differ). The old unique was (team_code, full_name).
ALTER TABLE public.live_players DROP CONSTRAINT IF EXISTS live_players_team_code_full_name_key;
ALTER TABLE public.live_players
  ADD CONSTRAINT live_players_comp_team_name_key UNIQUE (competition_id, team_code, full_name);

-- boost_awards: slugs repeat across competitions ('winners' exists for WC,
-- CL and BL1 alike).
ALTER TABLE public.boost_awards DROP CONSTRAINT IF EXISTS boost_awards_slug_key;
ALTER TABLE public.boost_awards ADD CONSTRAINT boost_awards_competition_slug_key UNIQUE (competition_id, slug);

-- Read-path indexes for the competition scoping now on every hot query.
CREATE INDEX IF NOT EXISTS idx_live_matches_competition_date
  ON public.live_matches (competition_id, match_date);
CREATE INDEX IF NOT EXISTS idx_live_matches_competition_status
  ON public.live_matches (competition_id, status);
CREATE INDEX IF NOT EXISTS idx_leagues_competition
  ON public.leagues (competition_id) WHERE competition_id IS NOT NULL;

ANALYZE public.live_matches;
ANALYZE public.teams;
ANALYZE public.boost_awards;
ANALYZE public.live_players;
