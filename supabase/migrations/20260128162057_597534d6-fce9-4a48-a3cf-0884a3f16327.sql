-- Add phone_number column to profiles table
ALTER TABLE public.profiles ADD COLUMN phone_number text;

-- Create index for phone number lookups
CREATE INDEX idx_profiles_phone_number ON public.profiles(phone_number);

-- Create OTP codes table for temporary storage
CREATE TABLE public.otp_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_number text NOT NULL,
  code text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  expires_at timestamp with time zone NOT NULL DEFAULT (now() + interval '5 minutes'),
  used boolean NOT NULL DEFAULT false,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE
);

-- Enable RLS on otp_codes
ALTER TABLE public.otp_codes ENABLE ROW LEVEL SECURITY;

-- Service role only access (edge functions use service role)
-- No public policies needed as this table is managed by edge functions

-- Create cleanup function for expired OTPs
CREATE OR REPLACE FUNCTION public.cleanup_expired_otps()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM public.otp_codes WHERE expires_at < now() OR used = true;
$$;