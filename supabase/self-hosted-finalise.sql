-- =============================================================================
-- Self-hosted finalise — run AFTER the Supabase-era migrations.
--
-- Creates the public.users view our API writes to, plus INSTEAD OF triggers
-- that route INSERT/DELETE through to auth.users. This lets the API code
-- remain blissfully unaware of the auth.users legacy.
-- =============================================================================

-- refresh_tokens: stores hashed refresh tokens for the custom JWT layer.
-- Supabase handled this internally; on self-hosted we own it.
CREATE TABLE IF NOT EXISTS public.refresh_tokens (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token_hash TEXT        NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked    BOOLEAN     NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user    ON public.refresh_tokens (user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_hash    ON public.refresh_tokens (token_hash);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_expires ON public.refresh_tokens (expires_at);

-- Redefine is_any_admin() now that user_roles exists, using a direct SELECT
-- instead of dynamic EXECUTE (faster, inlinable).
CREATE OR REPLACE FUNCTION public.is_any_admin(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = 'admin'::app_role
  )
$$;

CREATE OR REPLACE VIEW public.users AS
SELECT
  id,
  email,
  phone,
  display_name,
  raw_user_meta_data,
  created_at,
  updated_at
FROM auth.users;

-- INSERT via the view → insert into auth.users. Only exposes the columns
-- our API supplies (id, email, display_name, created_at). Other columns
-- fall to their defaults.
CREATE OR REPLACE FUNCTION public.users_insert_trigger()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO auth.users (id, email, phone, display_name, raw_user_meta_data, created_at, updated_at)
  VALUES (
    COALESCE(NEW.id, gen_random_uuid()),
    NEW.email,
    NEW.phone,
    NEW.display_name,
    COALESCE(NEW.raw_user_meta_data, '{}'::jsonb),
    COALESCE(NEW.created_at, now()),
    COALESCE(NEW.updated_at, now())
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS users_insert ON public.users;
CREATE TRIGGER users_insert
  INSTEAD OF INSERT ON public.users
  FOR EACH ROW
  EXECUTE FUNCTION public.users_insert_trigger();

CREATE OR REPLACE FUNCTION public.users_delete_trigger()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  DELETE FROM auth.users WHERE id = OLD.id;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS users_delete ON public.users;
CREATE TRIGGER users_delete
  INSTEAD OF DELETE ON public.users
  FOR EACH ROW
  EXECUTE FUNCTION public.users_delete_trigger();

CREATE OR REPLACE FUNCTION public.users_update_trigger()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE auth.users SET
    email = NEW.email,
    phone = NEW.phone,
    display_name = NEW.display_name,
    raw_user_meta_data = NEW.raw_user_meta_data,
    updated_at = now()
  WHERE id = OLD.id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS users_update ON public.users;
CREATE TRIGGER users_update
  INSTEAD OF UPDATE ON public.users
  FOR EACH ROW
  EXECUTE FUNCTION public.users_update_trigger();
