-- Leagues are PER-GAME. The original multi-competition design allowed
-- competition_id NULL = "all competitions combined", but that made every
-- WC-era private league follow users into Bundesliga/Premier League/La Liga
-- with cross-game point totals — confusing, and cross-game leagues are
-- explicitly out of scope for now.
--
-- Backfill: every NULL-scope league becomes a World Cup 2026 league. All of
-- them were created during the single-competition WC era, so this pins them
-- to the game their members actually played. Their leaderboards switch from
-- "combined across games" to "WC only" — for WC-era members that's the same
-- number, and it stops new-game predictions from bleeding into an archived
-- league's standings.
--
-- ⚠️ Ordering: apply only AFTER the code deploy that (a) treats NULL-scoped
-- tenant_custom_boosts as counting in every scope (leaderboard.ts +
-- leaguesExport.ts) and (b) scopes the leagues CSV per league. Against older
-- code this UPDATE would silently drop all custom-boost points from every
-- private league's standings (custom boosts are NULL-scoped) and desync the
-- CSV export from the in-app boards.
--
-- The column stays nullable: a stale pre-deploy client may still create an
-- unscoped league for a short while (the frontend shows NULL-scope leagues
-- in every game rather than nowhere, so nothing goes invisible).

UPDATE public.leagues
   SET competition_id = 'a0000000-0000-4000-8000-000000000001'
 WHERE competition_id IS NULL;
