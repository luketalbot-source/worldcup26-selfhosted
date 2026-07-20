-- Multi-competition platform, Phase D step 1: CL + BL1 boost award seeds.
--
-- ⚠️ Apply as part of GO-LIVE (after Phase C), not before. Visibility:
-- the boost tab fetches awards SCOPED to the tenant's active competition
-- (GET /api/boosts/awards?competition=<slug>), so these rows only appear
-- to tenants that have CL/BL1 enabled AND selected. The unscoped legacy
-- GET (no param) returns every row — deployed frontends all pass the
-- param, so that path only serves back-compat/API consumers.
-- Competition activation (is_active=true) and per-tenant enablement are
-- deliberate admin actions, NOT part of this migration.
--
-- Slugs reuse the WC vocabulary (UNIQUE is per-competition since Phase C),
-- so the frontend's existing boost.awards.* i18n keys and award images
-- resolve for free; descriptions get competition-suffixed i18n overrides.

INSERT INTO public.boost_awards (slug, name, description, prediction_type, lock_date, display_order, competition_id) VALUES
  -- UEFA Champions League 2026/27
  ('winners',     'Winners',     'Which team will win the Champions League?',   'team',   '2026-09-15 00:00:00+00', 1, 'a0000000-0000-4000-8000-000000000002'),
  ('golden-boot', 'Top Scorer',  'Which player will score the most goals?',     'player', '2026-09-15 00:00:00+00', 2, 'a0000000-0000-4000-8000-000000000002'),
  ('goal-rush',   'Goal Rush!',  'Which team will score the most goals?',       'team',   '2026-09-15 00:00:00+00', 3, 'a0000000-0000-4000-8000-000000000002'),
  ('shame',       'Shame!',      'Which team will get the most red and yellow cards?', 'team', '2026-09-15 00:00:00+00', 4, 'a0000000-0000-4000-8000-000000000002'),
  ('flash',       'Flash!',      'Which team will score the fastest goal?',     'team',   '2026-09-15 00:00:00+00', 5, 'a0000000-0000-4000-8000-000000000002'),
  -- Bundesliga 2026/27
  ('winners',     'Winners',     'Which team will win the Bundesliga?',         'team',   '2026-08-28 00:00:00+00', 1, 'a0000000-0000-4000-8000-000000000003'),
  ('golden-boot', 'Top Scorer',  'Which player will score the most goals?',     'player', '2026-08-28 00:00:00+00', 2, 'a0000000-0000-4000-8000-000000000003'),
  ('goal-rush',   'Goal Rush!',  'Which team will score the most goals?',       'team',   '2026-08-28 00:00:00+00', 3, 'a0000000-0000-4000-8000-000000000003'),
  ('shame',       'Shame!',      'Which team will get the most red and yellow cards?', 'team', '2026-08-28 00:00:00+00', 4, 'a0000000-0000-4000-8000-000000000003'),
  ('flash',       'Flash!',      'Which team will score the fastest goal?',     'team',   '2026-08-28 00:00:00+00', 5, 'a0000000-0000-4000-8000-000000000003');
