-- Create table for tenant-specific custom boosts
CREATE TABLE public.tenant_custom_boosts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  points_value INTEGER NOT NULL DEFAULT 5,
  prediction_type TEXT NOT NULL CHECK (prediction_type IN ('team', 'player')),
  image_url TEXT,
  display_order INTEGER NOT NULL DEFAULT 0,
  lock_date TIMESTAMP WITH TIME ZONE,
  original_language TEXT DEFAULT 'en',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create table for user predictions on custom boosts
CREATE TABLE public.tenant_custom_boost_predictions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  custom_boost_id UUID NOT NULL REFERENCES public.tenant_custom_boosts(id) ON DELETE CASCADE,
  predicted_team_code TEXT,
  predicted_player_name TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, custom_boost_id)
);

-- Create table for admin-set results on custom boosts
CREATE TABLE public.tenant_custom_boost_results (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  custom_boost_id UUID NOT NULL REFERENCES public.tenant_custom_boosts(id) ON DELETE CASCADE UNIQUE,
  result_team_code TEXT,
  result_player_name TEXT,
  set_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.tenant_custom_boosts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_custom_boost_predictions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_custom_boost_results ENABLE ROW LEVEL SECURITY;

-- RLS Policies for tenant_custom_boosts
CREATE POLICY "Users can view custom boosts in their tenant"
ON public.tenant_custom_boosts
FOR SELECT
USING (tenant_id = get_user_tenant_id(auth.uid()) OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can manage custom boosts"
ON public.tenant_custom_boosts
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

-- RLS Policies for tenant_custom_boost_predictions
CREATE POLICY "Users can view predictions in same tenant"
ON public.tenant_custom_boost_predictions
FOR SELECT
USING (tenant_id = get_user_tenant_id(auth.uid()) OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Users can insert own predictions"
ON public.tenant_custom_boost_predictions
FOR INSERT
WITH CHECK (auth.uid() = user_id AND tenant_id = get_user_tenant_id(auth.uid()));

CREATE POLICY "Users can update own predictions"
ON public.tenant_custom_boost_predictions
FOR UPDATE
USING (auth.uid() = user_id AND tenant_id = get_user_tenant_id(auth.uid()));

CREATE POLICY "Users can delete own predictions"
ON public.tenant_custom_boost_predictions
FOR DELETE
USING (auth.uid() = user_id AND tenant_id = get_user_tenant_id(auth.uid()));

-- RLS Policies for tenant_custom_boost_results
CREATE POLICY "Anyone can view results"
ON public.tenant_custom_boost_results
FOR SELECT
USING (true);

CREATE POLICY "Admins can manage results"
ON public.tenant_custom_boost_results
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

-- Triggers for updated_at
CREATE TRIGGER update_tenant_custom_boosts_updated_at
  BEFORE UPDATE ON public.tenant_custom_boosts
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER update_tenant_custom_boost_predictions_updated_at
  BEFORE UPDATE ON public.tenant_custom_boost_predictions
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER update_tenant_custom_boost_results_updated_at
  BEFORE UPDATE ON public.tenant_custom_boost_results
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();