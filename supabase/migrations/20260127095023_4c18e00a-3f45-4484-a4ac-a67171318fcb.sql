-- Create a table to store live match data from the API
CREATE TABLE public.live_matches (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  match_id TEXT NOT NULL UNIQUE,
  api_match_id INTEGER,
  home_team_name TEXT NOT NULL,
  home_team_code TEXT NOT NULL,
  away_team_name TEXT NOT NULL,
  away_team_code TEXT NOT NULL,
  home_score INTEGER,
  away_score INTEGER,
  match_date TIMESTAMP WITH TIME ZONE NOT NULL,
  venue TEXT,
  city TEXT,
  stage TEXT NOT NULL DEFAULT 'group',
  group_name TEXT,
  status TEXT NOT NULL DEFAULT 'SCHEDULED',
  last_updated TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS (public read, no write from client)
ALTER TABLE public.live_matches ENABLE ROW LEVEL SECURITY;

-- Everyone can read matches
CREATE POLICY "Anyone can view matches" 
  ON public.live_matches 
  FOR SELECT 
  USING (true);

-- Create index for faster lookups
CREATE INDEX idx_live_matches_match_id ON public.live_matches(match_id);
CREATE INDEX idx_live_matches_status ON public.live_matches(status);