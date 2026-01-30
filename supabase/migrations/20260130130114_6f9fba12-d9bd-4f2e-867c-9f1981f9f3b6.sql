-- Update RLS policies on user_roles to include site_admin
DROP POLICY IF EXISTS "Admins can view all roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can insert roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can delete roles" ON public.user_roles;

CREATE POLICY "Admins can view all roles" ON public.user_roles
FOR SELECT
USING (is_any_admin(auth.uid()));

CREATE POLICY "Admins can insert roles" ON public.user_roles
FOR INSERT
WITH CHECK (is_any_admin(auth.uid()));

CREATE POLICY "Admins can delete roles" ON public.user_roles
FOR DELETE
USING (is_any_admin(auth.uid()));

-- Update RLS policies on tenants for insert/update/delete
DROP POLICY IF EXISTS "Admins can insert tenants" ON public.tenants;
DROP POLICY IF EXISTS "Admins can update tenants" ON public.tenants;
DROP POLICY IF EXISTS "Admins can delete tenants" ON public.tenants;

CREATE POLICY "Admins can insert tenants" ON public.tenants
FOR INSERT
WITH CHECK (
  has_role(auth.uid(), 'site_admin'::app_role) 
  OR has_role(auth.uid(), 'admin'::app_role)
);

CREATE POLICY "Admins can update tenants" ON public.tenants
FOR UPDATE
USING (
  has_role(auth.uid(), 'site_admin'::app_role) 
  OR has_role(auth.uid(), 'admin'::app_role)
);

CREATE POLICY "Admins can delete tenants" ON public.tenants
FOR DELETE
USING (
  has_role(auth.uid(), 'site_admin'::app_role) 
  OR has_role(auth.uid(), 'admin'::app_role)
);

-- Update boost_awards admin policy
DROP POLICY IF EXISTS "Admins can manage awards" ON public.boost_awards;

CREATE POLICY "Admins can manage awards" ON public.boost_awards
FOR ALL
USING (is_any_admin(auth.uid()));

-- Update boost_results admin policy  
DROP POLICY IF EXISTS "Admins can manage results" ON public.boost_results;

CREATE POLICY "Admins can manage results" ON public.boost_results
FOR ALL
USING (is_any_admin(auth.uid()));

-- Update tenant_custom_boosts admin policy
DROP POLICY IF EXISTS "Admins can manage custom boosts" ON public.tenant_custom_boosts;

CREATE POLICY "Admins can manage custom boosts" ON public.tenant_custom_boosts
FOR ALL
USING (is_any_admin(auth.uid()));

-- Update tenant_custom_boost_results admin policy
DROP POLICY IF EXISTS "Admins can manage results" ON public.tenant_custom_boost_results;

CREATE POLICY "Admins can manage results" ON public.tenant_custom_boost_results
FOR ALL
USING (is_any_admin(auth.uid()));

-- Update tenant_oidc_config admin policy
DROP POLICY IF EXISTS "Admins can manage OIDC config" ON public.tenant_oidc_config;

CREATE POLICY "Admins can manage OIDC config" ON public.tenant_oidc_config
FOR ALL
USING (is_any_admin(auth.uid()));