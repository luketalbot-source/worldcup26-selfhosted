-- Per-match override flag.
--
-- Sync from football-data.org normally upserts every row on every run.
-- The tournament needs a backstop: if FD's data is wrong, missing, or
-- offline mid-match, an admin must be able to fix the score / fill in the
-- knockout draw / set status — and have those edits survive the next sync.
--
-- runSync respects this column via WHERE NOT manual_override on the
-- ON CONFLICT DO UPDATE, so any row the admin has touched is locked from
-- automatic updates until they explicitly release it.
--
-- Partial index: most rows will never be overridden (only ones the admin
-- actively edits), so a partial index keeps lookups + the sync's per-row
-- predicate evaluation cheap without bloating storage.

ALTER TABLE public.live_matches
  ADD COLUMN IF NOT EXISTS manual_override BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_live_matches_manual_override
  ON public.live_matches (manual_override)
  WHERE manual_override = true;
