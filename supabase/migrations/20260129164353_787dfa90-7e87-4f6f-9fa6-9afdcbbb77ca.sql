-- Create boost_awards table to define all the special awards
CREATE TABLE public.boost_awards (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  prediction_type text NOT NULL CHECK (prediction_type IN ('team', 'player')),
  points_value integer NOT NULL DEFAULT 5,
  lock_date timestamp with time zone,
  image_url text,
  display_order integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Create boost_predictions table for user predictions
CREATE TABLE public.boost_predictions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  tenant_id uuid REFERENCES public.tenants(id),
  award_id uuid NOT NULL REFERENCES public.boost_awards(id) ON DELETE CASCADE,
  predicted_team_code text,
  predicted_player_name text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(user_id, award_id)
);

-- Create boost_results table for admin-set final results
CREATE TABLE public.boost_results (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  award_id uuid NOT NULL REFERENCES public.boost_awards(id) ON DELETE CASCADE UNIQUE,
  result_team_code text,
  result_player_name text,
  set_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE public.boost_awards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.boost_predictions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.boost_results ENABLE ROW LEVEL SECURITY;

-- RLS for boost_awards (public read, admin write)
CREATE POLICY "Anyone can view awards" ON public.boost_awards FOR SELECT USING (true);
CREATE POLICY "Admins can manage awards" ON public.boost_awards FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));

-- RLS for boost_predictions (users can CRUD their own, view same tenant)
CREATE POLICY "Users can view predictions in same tenant" ON public.boost_predictions 
  FOR SELECT USING (tenant_id = get_user_tenant_id(auth.uid()) OR has_role(auth.uid(), 'admin'::app_role));
  
CREATE POLICY "Users can insert own predictions" ON public.boost_predictions 
  FOR INSERT WITH CHECK (auth.uid() = user_id AND tenant_id = get_user_tenant_id(auth.uid()));
  
CREATE POLICY "Users can update own predictions" ON public.boost_predictions 
  FOR UPDATE USING (auth.uid() = user_id AND tenant_id = get_user_tenant_id(auth.uid()));
  
CREATE POLICY "Users can delete own predictions" ON public.boost_predictions 
  FOR DELETE USING (auth.uid() = user_id AND tenant_id = get_user_tenant_id(auth.uid()));

-- RLS for boost_results (public read, admin write)
CREATE POLICY "Anyone can view results" ON public.boost_results FOR SELECT USING (true);
CREATE POLICY "Admins can manage results" ON public.boost_results FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));

-- Add updated_at triggers
CREATE TRIGGER update_boost_awards_updated_at BEFORE UPDATE ON public.boost_awards
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
  
CREATE TRIGGER update_boost_predictions_updated_at BEFORE UPDATE ON public.boost_predictions
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
  
CREATE TRIGGER update_boost_results_updated_at BEFORE UPDATE ON public.boost_results
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- Insert all the boost awards with appropriate lock dates
-- Tournament starts June 11, 2026 - most team awards lock then
-- Player awards can lock later since rosters finalize closer to tournament
INSERT INTO public.boost_awards (slug, name, description, prediction_type, lock_date, display_order) VALUES
  ('winners', 'Winners', 'Which team will win the World Cup?', 'team', '2026-06-11 00:00:00+00', 1),
  ('golden-boot', 'Golden Boot', 'Which player will score the most goals?', 'player', '2026-06-11 00:00:00+00', 2),
  ('golden-glove', 'Golden Glove', 'Who will be the best goalkeeper?', 'player', '2026-06-11 00:00:00+00', 3),
  ('golden-ball', 'Golden Ball', 'Who will be the best player?', 'player', '2026-06-11 00:00:00+00', 4),
  ('wooden-spoon', 'Wooden Spoon', 'Which team will score zero goals?', 'team', '2026-06-11 00:00:00+00', 5),
  ('goal-rush', 'Goal Rush!', 'Which team will score the most goals in a single game?', 'team', '2026-06-11 00:00:00+00', 6),
  ('shame', 'Shame!', 'Which team will get the most red and yellow cards?', 'team', '2026-06-11 00:00:00+00', 7),
  ('flash', 'Flash!', 'Which team will score the fastest goal?', 'team', '2026-06-11 00:00:00+00', 8),
  ('young-player', 'FIFA Young Player', 'Best player under 21?', 'player', '2026-06-11 00:00:00+00', 9),
  ('fair-play', 'FIFA Fair Play', 'Team with the best record of play?', 'team', '2026-06-11 00:00:00+00', 10),
  ('entertaining', 'Most Entertaining', 'The team that most entertained the public?', 'team', '2026-06-11 00:00:00+00', 11);