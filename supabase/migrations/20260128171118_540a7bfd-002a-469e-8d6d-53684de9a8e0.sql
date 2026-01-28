-- Create admin role enum
CREATE TYPE public.app_role AS ENUM ('admin', 'moderator');

-- Create tenants table
CREATE TABLE public.tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  uid TEXT NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(16), 'hex'),
  name TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create user_roles table for admin access
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

-- Add tenant_id to profiles
ALTER TABLE public.profiles 
ADD COLUMN tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE;

-- Add tenant_id to predictions
ALTER TABLE public.predictions 
ADD COLUMN tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE;

-- Add tenant_id to leagues
ALTER TABLE public.leagues 
ADD COLUMN tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE;

-- Add tenant_id to league_members
ALTER TABLE public.league_members 
ADD COLUMN tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE;

-- Enable RLS on new tables
ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Create security definer function for role checking
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
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
      AND role = _role
  )
$$;

-- Create security definer function to get user's tenant_id
CREATE OR REPLACE FUNCTION public.get_user_tenant_id(_user_id UUID)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT tenant_id FROM public.profiles WHERE user_id = _user_id
$$;

-- Create security definer function to get tenant by uid
CREATE OR REPLACE FUNCTION public.get_tenant_by_uid(_uid TEXT)
RETURNS TABLE(id UUID, name TEXT, uid TEXT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id, name, uid FROM public.tenants WHERE uid = _uid
$$;

-- RLS Policies for tenants table
CREATE POLICY "Anyone can view tenants" ON public.tenants
FOR SELECT USING (true);

CREATE POLICY "Admins can insert tenants" ON public.tenants
FOR INSERT WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update tenants" ON public.tenants
FOR UPDATE USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete tenants" ON public.tenants
FOR DELETE USING (public.has_role(auth.uid(), 'admin'));

-- RLS Policies for user_roles table
CREATE POLICY "Admins can view all roles" ON public.user_roles
FOR SELECT USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can insert roles" ON public.user_roles
FOR INSERT WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete roles" ON public.user_roles
FOR DELETE USING (public.has_role(auth.uid(), 'admin'));

-- Update profiles RLS to include tenant filtering
DROP POLICY IF EXISTS "Users can view profiles with predictions" ON public.profiles;
CREATE POLICY "Users can view profiles in same tenant or own" ON public.profiles
FOR SELECT USING (
  (tenant_id = public.get_user_tenant_id(auth.uid()))
  OR (auth.uid() = user_id)
  OR public.has_role(auth.uid(), 'admin')
);

-- Update predictions RLS to include tenant filtering
DROP POLICY IF EXISTS "Users can view all predictions" ON public.predictions;
CREATE POLICY "Users can view predictions in same tenant" ON public.predictions
FOR SELECT USING (
  (tenant_id = public.get_user_tenant_id(auth.uid()))
  OR public.has_role(auth.uid(), 'admin')
);

DROP POLICY IF EXISTS "Users can insert their own predictions" ON public.predictions;
CREATE POLICY "Users can insert predictions in their tenant" ON public.predictions
FOR INSERT WITH CHECK (
  (auth.uid() = user_id)
  AND (tenant_id = public.get_user_tenant_id(auth.uid()))
);

DROP POLICY IF EXISTS "Users can update their own predictions" ON public.predictions;
CREATE POLICY "Users can update predictions in their tenant" ON public.predictions
FOR UPDATE USING (
  (auth.uid() = user_id)
  AND (tenant_id = public.get_user_tenant_id(auth.uid()))
);

DROP POLICY IF EXISTS "Users can delete their own predictions" ON public.predictions;
CREATE POLICY "Users can delete predictions in their tenant" ON public.predictions
FOR DELETE USING (
  (auth.uid() = user_id)
  AND (tenant_id = public.get_user_tenant_id(auth.uid()))
);

-- Update leagues RLS
DROP POLICY IF EXISTS "Anyone can view leagues they are a member of" ON public.leagues;
CREATE POLICY "Users can view leagues in same tenant" ON public.leagues
FOR SELECT USING (
  ((creator_id = auth.uid()) OR (id IN (SELECT get_user_league_ids(auth.uid()))))
  AND (tenant_id = public.get_user_tenant_id(auth.uid()))
);

DROP POLICY IF EXISTS "Authenticated users can create leagues" ON public.leagues;
CREATE POLICY "Users can create leagues in their tenant" ON public.leagues
FOR INSERT WITH CHECK (
  (auth.uid() = creator_id)
  AND (tenant_id = public.get_user_tenant_id(auth.uid()))
);

DROP POLICY IF EXISTS "Creators can update their leagues" ON public.leagues;
CREATE POLICY "Creators can update leagues in their tenant" ON public.leagues
FOR UPDATE USING (
  (auth.uid() = creator_id)
  AND (tenant_id = public.get_user_tenant_id(auth.uid()))
);

DROP POLICY IF EXISTS "Creators can delete their leagues" ON public.leagues;
CREATE POLICY "Creators can delete leagues in their tenant" ON public.leagues
FOR DELETE USING (
  (auth.uid() = creator_id)
  AND (tenant_id = public.get_user_tenant_id(auth.uid()))
);

-- Update league_members RLS
DROP POLICY IF EXISTS "Members can view league members" ON public.league_members;
CREATE POLICY "Users can view league members in same tenant" ON public.league_members
FOR SELECT USING (
  (league_id IN (SELECT get_user_league_ids(auth.uid())))
  AND (tenant_id = public.get_user_tenant_id(auth.uid()))
);

DROP POLICY IF EXISTS "Authenticated users can join leagues" ON public.league_members;
CREATE POLICY "Users can join leagues in their tenant" ON public.league_members
FOR INSERT WITH CHECK (
  (auth.uid() = user_id)
  AND (tenant_id = public.get_user_tenant_id(auth.uid()))
);

DROP POLICY IF EXISTS "Creators can remove league members" ON public.league_members;
CREATE POLICY "Creators can remove members in their tenant" ON public.league_members
FOR DELETE USING (
  (is_league_creator(auth.uid(), league_id) OR (auth.uid() = user_id))
  AND (tenant_id = public.get_user_tenant_id(auth.uid()))
);

DROP POLICY IF EXISTS "Users can leave leagues" ON public.league_members;

-- Create the default "Flip" tenant
INSERT INTO public.tenants (name, uid) VALUES ('Flip', 'flip-' || encode(gen_random_bytes(12), 'hex'));

-- Update existing data to belong to Flip tenant
UPDATE public.profiles SET tenant_id = (SELECT id FROM public.tenants WHERE name = 'Flip');
UPDATE public.predictions SET tenant_id = (SELECT id FROM public.tenants WHERE name = 'Flip');
UPDATE public.leagues SET tenant_id = (SELECT id FROM public.tenants WHERE name = 'Flip');
UPDATE public.league_members SET tenant_id = (SELECT id FROM public.tenants WHERE name = 'Flip');

-- Add updated_at trigger for tenants
CREATE TRIGGER update_tenants_updated_at
BEFORE UPDATE ON public.tenants
FOR EACH ROW
EXECUTE FUNCTION public.handle_updated_at();