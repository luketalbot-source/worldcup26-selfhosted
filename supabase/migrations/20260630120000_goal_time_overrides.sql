-- Manual sub-minute overrides for goal timing. football-data.org only reports
-- integer minutes, so goals in the same minute tie — and the fastest-goal stat
-- (api/src/routes/stats.ts) can't rank or display them precisely. When we have
-- ground-truth seconds for a goal, record them here; the fastest-goal query
-- ranks + displays by these when present. Lives in its own table so it
-- SURVIVES match_goals re-syncs (syncGoalsFromFD does DELETE+INSERT on goals).
CREATE TABLE IF NOT EXISTS public.goal_time_overrides (
  match_id      text NOT NULL,
  player_name   text NOT NULL,
  total_seconds integer NOT NULL,
  note          text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (match_id, player_name)
);

-- Matías Galarza, Paraguay v Türkiye (Group D): 64s (1:04) — the tournament's
-- fastest goal. FD stored it as minute 2, tying Saibari (MAR, also "2'"), so
-- the stat showed Morocco. This pins the true time so Galarza ranks first.
INSERT INTO public.goal_time_overrides (match_id, player_name, total_seconds, note)
VALUES ('fd-537347', 'Matías Galarza', 64, 'Ground-truth 1:04 vs Türkiye; FD only stores integer minute')
ON CONFLICT (match_id, player_name) DO UPDATE
  SET total_seconds = EXCLUDED.total_seconds, note = EXCLUDED.note;
