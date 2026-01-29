-- Add consent tracking to profiles table
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS privacy_consent_at TIMESTAMP WITH TIME ZONE DEFAULT NULL;

-- Add index for cron job efficiency
CREATE INDEX IF NOT EXISTS idx_profiles_consent_null_tenant 
ON public.profiles (tenant_id) 
WHERE privacy_consent_at IS NULL;