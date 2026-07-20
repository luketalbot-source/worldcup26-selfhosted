-- Multi-competition platform, Phase A step 1 (additive; old code unaffected).
-- Introduces the competitions registry. One row per competition PER SEASON —
-- "Bundesliga 2027/28" will be a new row; archiving = is_active=false, which
-- is exactly how WC2026 is handled once its row exists.
--
-- Fixed literal UUIDs: later migrations use the WC id as a column DEFAULT so
-- any insert from still-deployed old code lands correctly attributed.

CREATE TABLE public.competitions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug          TEXT NOT NULL UNIQUE,            -- API-facing: 'wc-2026', 'cl-2026-27'
  fd_code       TEXT NOT NULL,                   -- football-data.org code: 'WC' | 'CL' | 'BL1'
  fd_season     INTEGER,                         -- explicit FD ?season= start year
  season        TEXT NOT NULL,                   -- display: '2026', '2026/27'
  name          TEXT NOT NULL,
  short_name    TEXT NOT NULL,
  format        TEXT NOT NULL CHECK (format IN ('tournament', 'league', 'hybrid')),
  boost_lock_at TIMESTAMPTZ,                     -- NULL = derived per format (see api/src/lib/boostDeadline.ts)
  is_active     BOOLEAN NOT NULL DEFAULT false,  -- drives sync scheduler + UI listing
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (fd_code, season)
);

ALTER TABLE public.competitions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view competitions" ON public.competitions FOR SELECT USING (true);

CREATE TRIGGER update_competitions_updated_at BEFORE UPDATE ON public.competitions
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

INSERT INTO public.competitions (id, slug, fd_code, fd_season, season, name, short_name, format, is_active, display_order) VALUES
  ('a0000000-0000-4000-8000-000000000001', 'wc-2026',    'WC',  2026, '2026',    'FIFA World Cup 2026',    'World Cup 2026',   'tournament', false, 1),
  ('a0000000-0000-4000-8000-000000000002', 'cl-2026-27', 'CL',  2026, '2026/27', 'UEFA Champions League',  'Champions League', 'hybrid',     false, 2),
  ('a0000000-0000-4000-8000-000000000003', 'bl1-2026-27','BL1', 2026, '2026/27', 'Bundesliga',             'Bundesliga',       'league',     false, 3);

-- Pin the WC boost deadline to its historical derived value (first knockout
-- kickoff) so the archive's boost lock can never drift once the derived
-- expression changes for other formats. Assert the data agrees.
UPDATE public.competitions
   SET boost_lock_at = (SELECT MIN(match_date) FROM public.live_matches WHERE stage <> 'group')
 WHERE slug = 'wc-2026';

DO $$
DECLARE
  pinned TIMESTAMPTZ;
  derived TIMESTAMPTZ;
BEGIN
  SELECT boost_lock_at INTO pinned FROM public.competitions WHERE slug = 'wc-2026';
  SELECT MIN(match_date) INTO derived FROM public.live_matches WHERE stage <> 'group';
  IF pinned IS NULL OR derived IS NULL OR pinned <> derived THEN
    RAISE EXCEPTION 'WC2026 boost_lock_at pin mismatch: pinned=%, derived=%', pinned, derived;
  END IF;
END $$;
