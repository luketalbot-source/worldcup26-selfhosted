-- Create security definer function to check league membership without recursion
CREATE OR REPLACE FUNCTION public.is_league_member(_user_id uuid, _league_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.league_members
    WHERE user_id = _user_id
      AND league_id = _league_id
  )
$$;

-- Create function to get user's league IDs
CREATE OR REPLACE FUNCTION public.get_user_league_ids(_user_id uuid)
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT league_id
  FROM public.league_members
  WHERE user_id = _user_id
$$;

-- Drop existing problematic policies
DROP POLICY IF EXISTS "Members can view league members" ON public.league_members;
DROP POLICY IF EXISTS "Anyone can view leagues they are a member of" ON public.leagues;

-- Recreate league_members SELECT policy using security definer function
CREATE POLICY "Members can view league members"
ON public.league_members
FOR SELECT
USING (
  league_id IN (SELECT public.get_user_league_ids(auth.uid()))
);

-- Recreate leagues SELECT policy using security definer function  
CREATE POLICY "Anyone can view leagues they are a member of"
ON public.leagues
FOR SELECT
USING (
  creator_id = auth.uid() 
  OR id IN (SELECT public.get_user_league_ids(auth.uid()))
);