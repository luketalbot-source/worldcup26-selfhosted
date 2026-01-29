-- Create enum for auth method selection
CREATE TYPE public.auth_method AS ENUM ('otp', 'oidc', 'both');

-- Add auth_method column to tenants table
ALTER TABLE public.tenants 
ADD COLUMN auth_method public.auth_method NOT NULL DEFAULT 'otp';

-- Create OIDC configuration table for tenants
CREATE TABLE public.tenant_oidc_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  auth_url TEXT NOT NULL,
  client_id TEXT NOT NULL,
  redirect_uri TEXT NOT NULL,
  issuer TEXT, -- Optional: for token validation
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (tenant_id)
);

-- Enable RLS
ALTER TABLE public.tenant_oidc_config ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to read their tenant's OIDC config (needed for login flow)
CREATE POLICY "Users can read their tenant OIDC config"
ON public.tenant_oidc_config
FOR SELECT
USING (true); -- Public read needed for unauthenticated login flow

-- Only admins can manage OIDC config
CREATE POLICY "Admins can manage OIDC config"
ON public.tenant_oidc_config
FOR ALL
USING (public.has_role(auth.uid(), 'admin'));

-- Create table to store OIDC subject mappings to users
CREATE TABLE public.oidc_identities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  oidc_subject TEXT NOT NULL, -- The 'sub' claim from the IDP
  oidc_issuer TEXT, -- Optional: the issuer URL
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, oidc_subject) -- One identity per tenant
);

-- Enable RLS
ALTER TABLE public.oidc_identities ENABLE ROW LEVEL SECURITY;

-- Users can only read their own identity
CREATE POLICY "Users can read own OIDC identity"
ON public.oidc_identities
FOR SELECT
USING (user_id = auth.uid());

-- Service role can manage all (for edge function)
-- No explicit policy needed as service_role bypasses RLS

-- Add updated_at trigger for tenant_oidc_config
CREATE TRIGGER update_tenant_oidc_config_updated_at
BEFORE UPDATE ON public.tenant_oidc_config
FOR EACH ROW
EXECUTE FUNCTION public.handle_updated_at();