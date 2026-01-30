-- Create a function to check if a user can access a specific tenant
-- Returns true if user's profile.tenant_id matches OR they have an oidc_identity for that tenant
CREATE OR REPLACE FUNCTION public.user_can_access_tenant(_user_id uuid, _tenant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    -- Check if profile tenant_id matches
    SELECT 1 FROM public.profiles 
    WHERE user_id = _user_id AND tenant_id = _tenant_id
  ) OR EXISTS (
    -- Check if user has OIDC identity for this tenant
    SELECT 1 FROM public.oidc_identities 
    WHERE user_id = _user_id AND tenant_id = _tenant_id
  );
$$;

-- Update predictions RLS policies to use the new function
DROP POLICY IF EXISTS "Users can insert predictions in their tenant" ON public.predictions;
CREATE POLICY "Users can insert predictions in their tenant" 
ON public.predictions FOR INSERT 
WITH CHECK (
  auth.uid() = user_id 
  AND user_can_access_tenant(auth.uid(), tenant_id)
);

DROP POLICY IF EXISTS "Users can update predictions in their tenant" ON public.predictions;
CREATE POLICY "Users can update predictions in their tenant" 
ON public.predictions FOR UPDATE 
USING (
  auth.uid() = user_id 
  AND user_can_access_tenant(auth.uid(), tenant_id)
);

DROP POLICY IF EXISTS "Users can delete predictions in their tenant" ON public.predictions;
CREATE POLICY "Users can delete predictions in their tenant" 
ON public.predictions FOR DELETE 
USING (
  auth.uid() = user_id 
  AND user_can_access_tenant(auth.uid(), tenant_id)
);

DROP POLICY IF EXISTS "Users can view predictions in same tenant" ON public.predictions;
CREATE POLICY "Users can view predictions in same tenant" 
ON public.predictions FOR SELECT 
USING (
  user_can_access_tenant(auth.uid(), tenant_id) 
  OR has_role(auth.uid(), 'admin'::app_role)
);

-- Update boost_predictions RLS policies
DROP POLICY IF EXISTS "Users can insert own predictions" ON public.boost_predictions;
CREATE POLICY "Users can insert own predictions" 
ON public.boost_predictions FOR INSERT 
WITH CHECK (
  auth.uid() = user_id 
  AND user_can_access_tenant(auth.uid(), tenant_id)
);

DROP POLICY IF EXISTS "Users can update own predictions" ON public.boost_predictions;
CREATE POLICY "Users can update own predictions" 
ON public.boost_predictions FOR UPDATE 
USING (
  auth.uid() = user_id 
  AND user_can_access_tenant(auth.uid(), tenant_id)
);

DROP POLICY IF EXISTS "Users can delete own predictions" ON public.boost_predictions;
CREATE POLICY "Users can delete own predictions" 
ON public.boost_predictions FOR DELETE 
USING (
  auth.uid() = user_id 
  AND user_can_access_tenant(auth.uid(), tenant_id)
);

DROP POLICY IF EXISTS "Users can view predictions in same tenant" ON public.boost_predictions;
CREATE POLICY "Users can view predictions in same tenant" 
ON public.boost_predictions FOR SELECT 
USING (
  user_can_access_tenant(auth.uid(), tenant_id) 
  OR has_role(auth.uid(), 'admin'::app_role)
);

-- Update tenant_custom_boost_predictions RLS policies
DROP POLICY IF EXISTS "Users can insert own predictions" ON public.tenant_custom_boost_predictions;
CREATE POLICY "Users can insert own predictions" 
ON public.tenant_custom_boost_predictions FOR INSERT 
WITH CHECK (
  auth.uid() = user_id 
  AND user_can_access_tenant(auth.uid(), tenant_id)
);

DROP POLICY IF EXISTS "Users can update own predictions" ON public.tenant_custom_boost_predictions;
CREATE POLICY "Users can update own predictions" 
ON public.tenant_custom_boost_predictions FOR UPDATE 
USING (
  auth.uid() = user_id 
  AND user_can_access_tenant(auth.uid(), tenant_id)
);

DROP POLICY IF EXISTS "Users can delete own predictions" ON public.tenant_custom_boost_predictions;
CREATE POLICY "Users can delete own predictions" 
ON public.tenant_custom_boost_predictions FOR DELETE 
USING (
  auth.uid() = user_id 
  AND user_can_access_tenant(auth.uid(), tenant_id)
);

DROP POLICY IF EXISTS "Users can view predictions in same tenant" ON public.tenant_custom_boost_predictions;
CREATE POLICY "Users can view predictions in same tenant" 
ON public.tenant_custom_boost_predictions FOR SELECT 
USING (
  user_can_access_tenant(auth.uid(), tenant_id) 
  OR has_role(auth.uid(), 'admin'::app_role)
);

-- Update leagues RLS policies
DROP POLICY IF EXISTS "Users can create leagues in their tenant" ON public.leagues;
CREATE POLICY "Users can create leagues in their tenant" 
ON public.leagues FOR INSERT 
WITH CHECK (
  auth.uid() = creator_id 
  AND user_can_access_tenant(auth.uid(), tenant_id)
);

DROP POLICY IF EXISTS "Creators can update leagues in their tenant" ON public.leagues;
CREATE POLICY "Creators can update leagues in their tenant" 
ON public.leagues FOR UPDATE 
USING (
  auth.uid() = creator_id 
  AND user_can_access_tenant(auth.uid(), tenant_id)
);

DROP POLICY IF EXISTS "Creators can delete leagues in their tenant" ON public.leagues;
CREATE POLICY "Creators can delete leagues in their tenant" 
ON public.leagues FOR DELETE 
USING (
  auth.uid() = creator_id 
  AND user_can_access_tenant(auth.uid(), tenant_id)
);

DROP POLICY IF EXISTS "Users can view leagues in same tenant" ON public.leagues;
CREATE POLICY "Users can view leagues in same tenant" 
ON public.leagues FOR SELECT 
USING (
  (creator_id = auth.uid() OR id IN (SELECT get_user_league_ids(auth.uid())))
  AND user_can_access_tenant(auth.uid(), tenant_id)
);

-- Update league_members RLS policies
DROP POLICY IF EXISTS "Users can join leagues in their tenant" ON public.league_members;
CREATE POLICY "Users can join leagues in their tenant" 
ON public.league_members FOR INSERT 
WITH CHECK (
  auth.uid() = user_id 
  AND user_can_access_tenant(auth.uid(), tenant_id)
);

DROP POLICY IF EXISTS "Creators can remove members in their tenant" ON public.league_members;
CREATE POLICY "Creators can remove members in their tenant" 
ON public.league_members FOR DELETE 
USING (
  (is_league_creator(auth.uid(), league_id) OR auth.uid() = user_id)
  AND user_can_access_tenant(auth.uid(), tenant_id)
);

DROP POLICY IF EXISTS "Users can view league members in same tenant" ON public.league_members;
CREATE POLICY "Users can view league members in same tenant" 
ON public.league_members FOR SELECT 
USING (
  league_id IN (SELECT get_user_league_ids(auth.uid()))
  AND user_can_access_tenant(auth.uid(), tenant_id)
);