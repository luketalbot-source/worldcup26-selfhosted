-- Per-tenant Terms of Use.
--
-- Optional free-form text that, when set, surfaces in the user-facing
-- nav footer as a "Terms" / "Nutzungsbedingungen" link next to the
-- existing trademark disclaimer. Tapping the link opens a dialog with
-- the full text. Tenants that leave the field empty get no link — the
-- product stays cleaner for the common case.
--
-- TEXT (not VARCHAR) so we don't have to predict length up-front; some
-- tenants paste multi-paragraph legal copy.

ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS terms_of_use TEXT;
