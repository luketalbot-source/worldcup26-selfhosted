
-- Create a table for tenant admin access (which tenants can each admin see)
CREATE TABLE IF NOT EXISTS public.admin_tenant_access (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    admin_user_id UUID NOT NULL,
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    UNIQUE (admin_user_id, tenant_id)
);

-- Enable RLS
ALTER TABLE public.admin_tenant_access ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (from failed migration attempt)
DROP POLICY IF EXISTS "Site admins can view all tenant access" ON public.admin_tenant_access;
DROP POLICY IF EXISTS "Site admins can manage tenant access" ON public.admin_tenant_access;

-- Site admins and legacy admins can view all tenant access
CREATE POLICY "Admins can view all tenant access"
ON public.admin_tenant_access
FOR SELECT
USING (has_role(auth.uid(), 'site_admin'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

-- Site admins and legacy admins can insert tenant access
CREATE POLICY "Admins can insert tenant access"
ON public.admin_tenant_access
FOR INSERT
WITH CHECK (has_role(auth.uid(), 'site_admin'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

-- Site admins and legacy admins can delete tenant access
CREATE POLICY "Admins can delete tenant access"
ON public.admin_tenant_access
FOR DELETE
USING (has_role(auth.uid(), 'site_admin'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

-- Create a function to check if an admin can access a tenant
CREATE OR REPLACE FUNCTION public.admin_can_access_tenant(_user_id UUID, _tenant_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    -- Site admins and legacy admins can access all tenants
    has_role(_user_id, 'site_admin'::app_role) 
    OR has_role(_user_id, 'admin'::app_role)
    -- Tenant admins can only access assigned tenants
    OR (
      has_role(_user_id, 'tenant_admin'::app_role) 
      AND EXISTS (
        SELECT 1 FROM public.admin_tenant_access
        WHERE admin_user_id = _user_id AND tenant_id = _tenant_id
      )
    )
$$;

-- Create a function to get all accessible tenants for an admin
CREATE OR REPLACE FUNCTION public.get_admin_accessible_tenants(_user_id UUID)
RETURNS SETOF UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT t.id FROM public.tenants t
  WHERE 
    -- Site admins and legacy admins can see all tenants
    has_role(_user_id, 'site_admin'::app_role) 
    OR has_role(_user_id, 'admin'::app_role)
    -- Tenant admins can only see assigned tenants
    OR (
      has_role(_user_id, 'tenant_admin'::app_role) 
      AND EXISTS (
        SELECT 1 FROM public.admin_tenant_access ata
        WHERE ata.admin_user_id = _user_id AND ata.tenant_id = t.id
      )
    )
$$;

-- Create a function to check if user is any type of admin
CREATE OR REPLACE FUNCTION public.is_any_admin(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role IN ('admin', 'site_admin', 'tenant_admin')
  )
$$;

-- Upgrade current 'admin' to 'site_admin' (Luke's user)
UPDATE public.user_roles 
SET role = 'site_admin'::app_role 
WHERE role = 'admin'::app_role;
