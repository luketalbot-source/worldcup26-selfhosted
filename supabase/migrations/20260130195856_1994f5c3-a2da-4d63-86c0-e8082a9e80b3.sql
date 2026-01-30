-- Create a function to get tenant users for OIDC tenants (via oidc_identities)
CREATE OR REPLACE FUNCTION public.get_oidc_tenant_profiles(_tenant_id uuid)
RETURNS TABLE(
  id uuid,
  user_id uuid,
  display_name text,
  avatar_emoji text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT p.id, p.user_id, p.display_name, p.avatar_emoji
  FROM public.profiles p
  INNER JOIN public.oidc_identities oi ON oi.user_id = p.user_id
  WHERE oi.tenant_id = _tenant_id;
$$;