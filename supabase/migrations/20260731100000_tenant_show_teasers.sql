-- Per-tenant opt-out of "coming soon" teaser competitions. Some customers
-- want their players to see ONLY the games enabled for them — no muted
-- teaser cards for games they haven't bought/enabled. Default TRUE keeps
-- current behaviour for every existing tenant; the admin page gets a
-- "Show upcoming games" checkbox per tenant.
--
-- Additive + defaulted: apply BEFORE deploying the code that reads it
-- (old code never references the column; new code expects it to exist).

ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS show_teaser_competitions BOOLEAN NOT NULL DEFAULT true;
