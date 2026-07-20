-- Multi-competition platform, Phase A step 2 (additive; old code unaffected).
-- Nullable competition_id columns everywhere the data is competition-shaped.
--
-- The four tables that will become NOT NULL in Phase C get a literal DEFAULT
-- of the WC2026 competition id: any stray insert from still-deployed old code
-- (e.g. the background teams sync) lands correctly attributed to the World
-- Cup instead of NULL. The default is dropped in Phase C once the generalized
-- sync stamps competition_id explicitly.
--
-- leagues + tenant_custom_boosts stay nullable forever and get NO default:
-- NULL there MEANS "all competitions combined" (an overall league / boost).

-- Will be NOT NULL after backfill (Phase C):
ALTER TABLE public.live_matches
  ADD COLUMN competition_id UUID REFERENCES public.competitions(id)
    DEFAULT 'a0000000-0000-4000-8000-000000000001',
  ADD COLUMN matchday INTEGER;  -- FD matchday; NULL for WC rows

ALTER TABLE public.teams
  ADD COLUMN competition_id UUID REFERENCES public.competitions(id)
    DEFAULT 'a0000000-0000-4000-8000-000000000001';

ALTER TABLE public.boost_awards
  ADD COLUMN competition_id UUID REFERENCES public.competitions(id)
    DEFAULT 'a0000000-0000-4000-8000-000000000001';

ALTER TABLE public.live_players
  ADD COLUMN competition_id UUID REFERENCES public.competitions(id)
    DEFAULT 'a0000000-0000-4000-8000-000000000001';

-- Nullable by design (NULL = overall / all competitions):
ALTER TABLE public.leagues
  ADD COLUMN competition_id UUID REFERENCES public.competitions(id);

ALTER TABLE public.tenant_custom_boosts
  ADD COLUMN competition_id UUID REFERENCES public.competitions(id);

-- Per-tenant competition feature flags. Absence of a row = competition is
-- disabled for that tenant. Enables staged rollout from the admin page.
CREATE TABLE public.tenant_competitions (
  tenant_id      UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  competition_id UUID NOT NULL REFERENCES public.competitions(id) ON DELETE CASCADE,
  enabled_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, competition_id)
);

ALTER TABLE public.tenant_competitions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view tenant competitions" ON public.tenant_competitions FOR SELECT USING (true);
