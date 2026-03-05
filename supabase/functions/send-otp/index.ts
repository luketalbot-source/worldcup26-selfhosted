import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { phone_number, tenant_id } = await req.json();
    
    if (!phone_number) {
      return new Response(
        JSON.stringify({ error: 'Phone number is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate phone number format (basic E.164 validation)
    const phoneRegex = /^\+[1-9]\d{6,14}$/;
    if (!phoneRegex.test(phone_number)) {
      return new Response(
        JSON.stringify({ error: 'Invalid phone number format. Use E.164 format (e.g., +1234567890)' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get Twilio credentials
    const twilioAccountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
    const twilioAuthToken = Deno.env.get('TWILIO_AUTH_TOKEN');
    const twilioPhoneNumber = Deno.env.get('TWILIO_PHONE_NUMBER');

    if (!twilioAccountSid || !twilioAuthToken || !twilioPhoneNumber) {
      return new Response(
        JSON.stringify({ error: 'SMS service not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Initialize Supabase client with service role
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Check if user exists with this phone number AND tenant_id
    let existingProfile = null;
    if (tenant_id) {
      const { data } = await supabase
        .from('profiles')
        .select('user_id')
        .eq('phone_number', phone_number)
        .eq('tenant_id', tenant_id)
        .maybeSingle();
      existingProfile = data;
    } else {
      // Legacy: check without tenant
      const { data } = await supabase
        .from('profiles')
        .select('user_id')
        .eq('phone_number', phone_number)
        .maybeSingle();
      existingProfile = data;
    }

    const isNewUser = !existingProfile;

    // Generate 6-digit OTP code
    const code = Math.floor(100000 + Math.random() * 900000).toString();

    // Clean up old OTPs for this phone number
    await supabase
      .from('otp_codes')
      .delete()
      .eq('phone_number', phone_number);

    // Store the OTP in database
    const { error: insertError } = await supabase
      .from('otp_codes')
      .insert({
        phone_number,
        code,
        expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(), // 5 minutes
      });

    if (insertError) {
      return new Response(
        JSON.stringify({ error: 'Failed to generate verification code' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Send SMS via Twilio
    const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${twilioAccountSid}/Messages.json`;
    const authHeader = btoa(`${twilioAccountSid}:${twilioAuthToken}`);

    const twilioResponse = await fetch(twilioUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${authHeader}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        To: phone_number,
        From: twilioPhoneNumber,
        Body: `Your WC2026 Predictor verification code is: ${code}. Valid for 5 minutes.`,
      }),
    });

    if (!twilioResponse.ok) {
      const errorText = await twilioResponse.text();

      // Clean up the OTP since SMS failed
      await supabase
        .from('otp_codes')
        .delete()
        .eq('phone_number', phone_number);
      
      return new Response(
        JSON.stringify({ error: 'Failed to send SMS. Please check your phone number.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ success: true, message: 'Verification code sent', isNewUser }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
