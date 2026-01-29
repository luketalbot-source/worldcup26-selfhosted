-- Drop the existing overly permissive SELECT policy
DROP POLICY IF EXISTS "Users can view profiles in same tenant or own" ON public.profiles;

-- Create a more restrictive policy: users can only see their own full profile
-- Admins can still see all profiles for management purposes
CREATE POLICY "Users can view own profile, admins can view all"
ON public.profiles
FOR SELECT
USING (
  (auth.uid() = user_id) OR 
  has_role(auth.uid(), 'admin'::app_role)
);

-- Update the profiles_public view to allow tenant-wide access (for leaderboard, etc.)
-- First drop and recreate with proper security
DROP VIEW IF EXISTS public.profiles_public;

CREATE VIEW public.profiles_public
WITH (security_invoker = on) AS
SELECT 
  id,
  user_id,
  display_name,
  avatar_emoji,
  tenant_id
FROM public.profiles;

-- Grant SELECT on the view to authenticated users
GRANT SELECT ON public.profiles_public TO authenticated;

-- Create RLS-like access control via a policy function for the view
-- Since views with security_invoker inherit the caller's permissions,
-- we need a separate approach - create a function to get tenant profiles safely

CREATE OR REPLACE FUNCTION public.get_tenant_profiles(_tenant_id uuid)
RETURNS TABLE (
  id uuid,
  user_id uuid,
  display_name text,
  avatar_emoji text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id, p.user_id, p.display_name, p.avatar_emoji
  FROM public.profiles p
  WHERE p.tenant_id = _tenant_id
$$;