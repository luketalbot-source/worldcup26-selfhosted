
-- Create load test tables that bypass auth.users FK constraint
-- These tables simulate the data structure for performance testing

-- Load test profiles (no FK to auth.users)
CREATE TABLE public.load_test_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  tenant_id UUID REFERENCES public.tenants(id),
  display_name TEXT NOT NULL,
  avatar_emoji TEXT DEFAULT '👤',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Load test predictions (no FK to auth.users)
CREATE TABLE public.load_test_predictions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  tenant_id UUID REFERENCES public.tenants(id),
  match_id TEXT NOT NULL,
  home_score INTEGER DEFAULT 0,
  away_score INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, match_id)
);

-- Create indexes for performance testing
CREATE INDEX idx_load_test_profiles_tenant ON public.load_test_profiles(tenant_id);
CREATE INDEX idx_load_test_profiles_user ON public.load_test_profiles(user_id);
CREATE INDEX idx_load_test_predictions_tenant ON public.load_test_predictions(tenant_id);
CREATE INDEX idx_load_test_predictions_user ON public.load_test_predictions(user_id);
CREATE INDEX idx_load_test_predictions_match ON public.load_test_predictions(match_id);

-- Allow public read for load testing (no RLS - test tables only)
ALTER TABLE public.load_test_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.load_test_predictions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view load test profiles" ON public.load_test_profiles FOR SELECT USING (true);
CREATE POLICY "Anyone can view load test predictions" ON public.load_test_predictions FOR SELECT USING (true);
CREATE POLICY "Admins can manage load test profiles" ON public.load_test_profiles FOR ALL USING (is_any_admin(auth.uid()));
CREATE POLICY "Admins can manage load test predictions" ON public.load_test_predictions FOR ALL USING (is_any_admin(auth.uid()));
