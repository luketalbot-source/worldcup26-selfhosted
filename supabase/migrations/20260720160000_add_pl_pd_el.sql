-- Multi-competition platform: add Premier League + La Liga (playable) and
-- Europa League (display-only "coming soon" teaser).
--
-- ⚠️ Additive/seed only. Like the CL/BL1 seeds, this does NOT activate the
-- competitions (is_active stays false) or enable them on any tenant — those
-- are deliberate go-live steps done separately.
--
-- Formats: PL + PD are straight leagues (matchday + table), same as BL1.
-- EL is hybrid (league phase + knockout), same as CL.
--
-- Europa League has NO data feed on the current football-data.org plan
-- (GET /competitions/EL → 403). It's added ONLY to render as a permanent
-- "coming soon" teaser (is_active=true, never enabled on a tenant) to gauge
-- demand before paying for a higher FD tier. It is NEVER synced: the
-- scheduler's warranted-sync gate skips competitions with zero live_matches,
-- and EL will always have zero. No boost awards are seeded for EL — a teaser
-- is never enterable, so its boosts are never shown; seed them if/when EL
-- gets a real feed.

INSERT INTO public.competitions (id, slug, fd_code, fd_season, season, name, short_name, format, is_active, display_order) VALUES
  ('a0000000-0000-4000-8000-000000000004', 'pl-2026-27', 'PL', 2026, '2026/27', 'Premier League',     'Premier League',  'league', false, 4),
  ('a0000000-0000-4000-8000-000000000005', 'pd-2026-27', 'PD', 2026, '2026/27', 'La Liga',            'La Liga',         'league', false, 5),
  ('a0000000-0000-4000-8000-000000000006', 'el-2026-27', 'EL', 2026, '2026/27', 'UEFA Europa League', 'Europa League',   'hybrid', false, 6);

-- Boost awards for the two PLAYABLE additions only (PL + PD). Slugs reuse the
-- WC vocabulary (UNIQUE is per-competition since Phase C) so the existing
-- boost.awards.* i18n keys and award images resolve for free. League boosts
-- lock at the season's first kickoff (PL: Aug 21, PD: Aug 16).
INSERT INTO public.boost_awards (slug, name, description, prediction_type, lock_date, display_order, competition_id) VALUES
  -- Premier League 2026/27
  ('winners',     'Winners',    'Which team will win the Premier League?',            'team',   '2026-08-21 00:00:00+00', 1, 'a0000000-0000-4000-8000-000000000004'),
  ('golden-boot', 'Top Scorer', 'Which player will score the most goals?',            'player', '2026-08-21 00:00:00+00', 2, 'a0000000-0000-4000-8000-000000000004'),
  ('goal-rush',   'Goal Rush!', 'Which team will score the most goals?',              'team',   '2026-08-21 00:00:00+00', 3, 'a0000000-0000-4000-8000-000000000004'),
  ('shame',       'Shame!',     'Which team will get the most red and yellow cards?', 'team',   '2026-08-21 00:00:00+00', 4, 'a0000000-0000-4000-8000-000000000004'),
  ('flash',       'Flash!',     'Which team will score the fastest goal?',            'team',   '2026-08-21 00:00:00+00', 5, 'a0000000-0000-4000-8000-000000000004'),
  -- La Liga 2026/27
  ('winners',     'Winners',    'Which team will win La Liga?',                       'team',   '2026-08-16 00:00:00+00', 1, 'a0000000-0000-4000-8000-000000000005'),
  ('golden-boot', 'Top Scorer', 'Which player will score the most goals?',            'player', '2026-08-16 00:00:00+00', 2, 'a0000000-0000-4000-8000-000000000005'),
  ('goal-rush',   'Goal Rush!', 'Which team will score the most goals?',              'team',   '2026-08-16 00:00:00+00', 3, 'a0000000-0000-4000-8000-000000000005'),
  ('shame',       'Shame!',     'Which team will get the most red and yellow cards?', 'team',   '2026-08-16 00:00:00+00', 4, 'a0000000-0000-4000-8000-000000000005'),
  ('flash',       'Flash!',     'Which team will score the fastest goal?',            'team',   '2026-08-16 00:00:00+00', 5, 'a0000000-0000-4000-8000-000000000005');
