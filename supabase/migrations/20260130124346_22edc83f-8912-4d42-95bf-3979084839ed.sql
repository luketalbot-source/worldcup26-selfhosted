-- Create an RPC function to fetch all admin users (only callable by admins)
CREATE OR REPLACE FUNCTION public.get_admin_users()
RETURNS TABLE (
  id UUID,
  user_id UUID,
  role app_role,
  created_at TIMESTAMPTZ,
  phone_number TEXT,
  display_name TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    ur.id,
    ur.user_id,
    ur.role,
    ur.created_at,
    p.phone_number,
    p.display_name
  FROM public.user_roles ur
  LEFT JOIN public.profiles p ON ur.user_id = p.user_id
  WHERE ur.role IN ('admin', 'site_admin', 'tenant_admin')
    AND is_any_admin(auth.uid())
  ORDER BY ur.created_at DESC
$$;