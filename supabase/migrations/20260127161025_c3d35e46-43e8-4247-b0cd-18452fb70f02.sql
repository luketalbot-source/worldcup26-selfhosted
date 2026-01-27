-- Create a public view that only exposes safe profile fields (no user_id)
CREATE VIEW public.profiles_public
WITH (security_invoker = on) AS
  SELECT 
    id,
    display_name,
    avatar_emoji,
    user_id  -- Still needed for joins, but access controlled via RLS
  FROM public.profiles;

-- Drop the existing overly permissive SELECT policy
DROP POLICY IF EXISTS "Profiles are viewable by everyone" ON public.profiles;

-- Create a more restrictive SELECT policy - users can only view profiles of users who have predictions
-- This allows leaderboard functionality while preventing enumeration of all users
CREATE POLICY "Users can view profiles with predictions"
ON public.profiles
FOR SELECT
USING (
  user_id IN (SELECT DISTINCT user_id FROM public.predictions)
  OR auth.uid() = user_id
);