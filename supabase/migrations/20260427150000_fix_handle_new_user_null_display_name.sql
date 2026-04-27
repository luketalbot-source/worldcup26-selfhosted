-- handle_new_user originally derived profiles.display_name from
-- raw_user_meta_data->>'display_name' or the email local-part. That works
-- for the original Supabase signup flow, but our OIDC path inserts users
-- with NEITHER set (auth.users.email is NULL and raw_user_meta_data is
-- '{}') and crashes on the NOT NULL constraint.
--
-- Robin Power couldn't sign in because Keycloak's userinfo response had
-- no `email` claim — every login attempt for him 500'd here.
--
-- Add two more fallbacks:
--   * NEW.display_name — the column we populate in upsertOidcUser when
--     given_name + family_name resolve cleanly
--   * 'User' — last-ditch default so the constraint never blocks signup
--
-- The post-insert sync in upsertOidcUser still runs and corrects
-- display_name to the proper "Given Family" form afterwards, so this
-- 'User' fallback only ever sticks for users whose IdP gives us nothing
-- at all.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (user_id, display_name)
  VALUES (
    NEW.id,
    COALESCE(
      NULLIF(NEW.raw_user_meta_data->>'display_name', ''),
      NULLIF(NEW.display_name, ''),
      NULLIF(split_part(NEW.email, '@', 1), ''),
      'User'
    )
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
