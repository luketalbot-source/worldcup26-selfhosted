-- Post-migration shim: create public.users as an updatable view of auth.users
-- so API code that references public.users continues to work against the schema
-- (which has all user FKs pointing to auth.users).
CREATE OR REPLACE VIEW public.users AS
  SELECT id, email, phone, display_name, raw_user_meta_data, created_at, updated_at
  FROM auth.users;

-- Make the view explicitly updatable for INSERT/UPDATE/DELETE through the view.
-- Postgres supports simple updatable views automatically, but be explicit for
-- clarity and to ensure trigger-less passthrough works.
