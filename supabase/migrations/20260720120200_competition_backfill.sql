-- Multi-competition platform, Phase A step 3: backfill (additive; fast —
-- the touched tables total ~1.5k rows; predictions is deliberately NOT
-- touched, competition derives via the existing live_matches join).

UPDATE public.live_matches  SET competition_id = 'a0000000-0000-4000-8000-000000000001' WHERE competition_id IS NULL;
UPDATE public.teams         SET competition_id = 'a0000000-0000-4000-8000-000000000001' WHERE competition_id IS NULL;
UPDATE public.boost_awards  SET competition_id = 'a0000000-0000-4000-8000-000000000001' WHERE competition_id IS NULL;
UPDATE public.live_players  SET competition_id = 'a0000000-0000-4000-8000-000000000001' WHERE competition_id IS NULL;

-- WC2026 archive stays visible for every existing tenant.
INSERT INTO public.tenant_competitions (tenant_id, competition_id)
SELECT t.id, 'a0000000-0000-4000-8000-000000000001'
FROM public.tenants t
ON CONFLICT (tenant_id, competition_id) DO NOTHING;

ANALYZE public.live_matches;
ANALYZE public.teams;
ANALYZE public.boost_awards;
ANALYZE public.live_players;
ANALYZE public.tenant_competitions;

-- Sanity assertions: nothing may remain unattributed.
DO $$
DECLARE
  n BIGINT;
BEGIN
  SELECT COUNT(*) INTO n FROM public.live_matches WHERE competition_id IS NULL;
  IF n > 0 THEN RAISE EXCEPTION 'live_matches: % rows without competition_id', n; END IF;
  SELECT COUNT(*) INTO n FROM public.teams WHERE competition_id IS NULL;
  IF n > 0 THEN RAISE EXCEPTION 'teams: % rows without competition_id', n; END IF;
  SELECT COUNT(*) INTO n FROM public.boost_awards WHERE competition_id IS NULL;
  IF n > 0 THEN RAISE EXCEPTION 'boost_awards: % rows without competition_id', n; END IF;
  SELECT COUNT(*) INTO n FROM public.live_players WHERE competition_id IS NULL;
  IF n > 0 THEN RAISE EXCEPTION 'live_players: % rows without competition_id', n; END IF;
  SELECT COUNT(*) INTO n FROM public.tenant_competitions;
  IF n = 0 THEN RAISE EXCEPTION 'tenant_competitions backfill produced no rows'; END IF;
END $$;
