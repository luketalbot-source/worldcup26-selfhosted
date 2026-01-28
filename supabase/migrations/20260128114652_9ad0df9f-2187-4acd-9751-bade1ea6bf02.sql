-- Create leagues table
CREATE TABLE public.leagues (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  avatar_emoji TEXT DEFAULT '🏆',
  join_code TEXT NOT NULL UNIQUE,
  creator_id UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create league_members table
CREATE TABLE public.league_members (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  league_id UUID NOT NULL REFERENCES public.leagues(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  joined_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(league_id, user_id)
);

-- Enable RLS
ALTER TABLE public.leagues ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.league_members ENABLE ROW LEVEL SECURITY;

-- Leagues policies
CREATE POLICY "Anyone can view leagues they are a member of"
ON public.leagues FOR SELECT
USING (
  id IN (SELECT league_id FROM public.league_members WHERE user_id = auth.uid())
  OR creator_id = auth.uid()
);

CREATE POLICY "Authenticated users can create leagues"
ON public.leagues FOR INSERT
WITH CHECK (auth.uid() = creator_id);

CREATE POLICY "Creators can update their leagues"
ON public.leagues FOR UPDATE
USING (auth.uid() = creator_id);

CREATE POLICY "Creators can delete their leagues"
ON public.leagues FOR DELETE
USING (auth.uid() = creator_id);

-- League members policies
CREATE POLICY "Members can view league members"
ON public.league_members FOR SELECT
USING (
  league_id IN (SELECT league_id FROM public.league_members WHERE user_id = auth.uid())
);

CREATE POLICY "Authenticated users can join leagues"
ON public.league_members FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can leave leagues"
ON public.league_members FOR DELETE
USING (auth.uid() = user_id);

-- Function to lookup league by join code (for joining)
CREATE OR REPLACE FUNCTION public.get_league_by_code(code TEXT)
RETURNS TABLE (
  id UUID,
  name TEXT,
  avatar_emoji TEXT
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id, name, avatar_emoji
  FROM public.leagues
  WHERE join_code = code;
$$;

-- Trigger for updated_at
CREATE TRIGGER update_leagues_updated_at
BEFORE UPDATE ON public.leagues
FOR EACH ROW
EXECUTE FUNCTION public.handle_updated_at();