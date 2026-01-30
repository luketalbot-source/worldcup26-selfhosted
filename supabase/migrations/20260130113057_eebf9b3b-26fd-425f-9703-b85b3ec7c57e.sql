
-- Step 1: Add new enum values (these get committed first)
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'site_admin';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'tenant_admin';
