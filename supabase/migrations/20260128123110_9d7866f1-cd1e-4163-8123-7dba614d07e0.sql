-- Create function to check if user is league creator
CREATE OR REPLACE FUNCTION public.is_league_creator(_user_id uuid, _league_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.leagues
    WHERE id = _league_id
      AND creator_id = _user_id
  )
$$;

-- Allow league creators to remove members
CREATE POLICY "Creators can remove league members"
ON public.league_members
FOR DELETE
USING (
  public.is_league_creator(auth.uid(), league_id)
);