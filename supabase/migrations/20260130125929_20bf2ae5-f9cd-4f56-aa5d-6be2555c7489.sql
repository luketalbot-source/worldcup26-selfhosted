-- Drop the existing profiles SELECT policy and recreate with proper admin role checks
DROP POLICY IF EXISTS "Users can view own profile, admins can view all" ON public.profiles;

CREATE POLICY "Users can view own profile, admins can view all" ON public.profiles
FOR SELECT
USING (
  auth.uid() = user_id 
  OR is_any_admin(auth.uid())
);

-- Also update admin_tenant_access policies to use is_any_admin for site-level access
DROP POLICY IF EXISTS "Admins can view all tenant access" ON public.admin_tenant_access;
DROP POLICY IF EXISTS "Admins can insert tenant access" ON public.admin_tenant_access;
DROP POLICY IF EXISTS "Admins can delete tenant access" ON public.admin_tenant_access;

CREATE POLICY "Site admins can view all tenant access" ON public.admin_tenant_access
FOR SELECT
USING (
  has_role(auth.uid(), 'site_admin'::app_role) 
  OR has_role(auth.uid(), 'admin'::app_role)
  OR admin_user_id = auth.uid()
);

CREATE POLICY "Site admins can insert tenant access" ON public.admin_tenant_access
FOR INSERT
WITH CHECK (
  has_role(auth.uid(), 'site_admin'::app_role) 
  OR has_role(auth.uid(), 'admin'::app_role)
);

CREATE POLICY "Site admins can delete tenant access" ON public.admin_tenant_access
FOR DELETE
USING (
  has_role(auth.uid(), 'site_admin'::app_role) 
  OR has_role(auth.uid(), 'admin'::app_role)
);

-- Create a secure function to get tenant user counts for admins
CREATE OR REPLACE FUNCTION public.get_tenant_user_count(_tenant_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COUNT(*)::integer FROM public.profiles WHERE tenant_id = _tenant_id
$$;