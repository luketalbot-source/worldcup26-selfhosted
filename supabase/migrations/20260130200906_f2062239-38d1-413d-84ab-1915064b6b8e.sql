-- Update the get_tenant_user_count function to handle both OTP and OIDC tenants
-- For OTP tenants: count profiles with matching tenant_id
-- For OIDC tenants: count oidc_identities with matching tenant_id
CREATE OR REPLACE FUNCTION public.get_tenant_user_count(_tenant_id uuid)
RETURNS integer
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT (
    -- Count from profiles (for OTP tenants)
    (SELECT COUNT(*)::integer FROM public.profiles WHERE tenant_id = _tenant_id)
    +
    -- Count from oidc_identities (for OIDC tenants), excluding users already counted via profiles
    (SELECT COUNT(DISTINCT oi.user_id)::integer 
     FROM public.oidc_identities oi
     WHERE oi.tenant_id = _tenant_id
       AND NOT EXISTS (
         SELECT 1 FROM public.profiles p 
         WHERE p.user_id = oi.user_id AND p.tenant_id = _tenant_id
       )
    )
  )::integer;
$$;