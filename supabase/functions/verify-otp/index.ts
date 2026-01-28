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
    const { phone_number, code, username } = await req.json();
    
    if (!phone_number || !code) {
      return new Response(
        JSON.stringify({ error: 'Phone number and code are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Initialize Supabase client with service role
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Check if the caller is already authenticated (existing user adding phone)
    let authenticatedUserId: string | null = null;
    const authHeader = req.headers.get('Authorization');
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.replace('Bearer ', '');
      const anonClient = createClient(supabaseUrl, supabaseAnonKey, {
        global: { headers: { Authorization: authHeader } }
      });
      const { data: claimsData, error: claimsError } = await anonClient.auth.getClaims(token);
      if (!claimsError && claimsData?.claims?.sub) {
        authenticatedUserId = claimsData.claims.sub as string;
        console.log(`Authenticated user updating phone: ${authenticatedUserId}`);
      }
    }

    // Verify the OTP
    const { data: otpRecord, error: otpError } = await supabase
      .from('otp_codes')
      .select('*')
      .eq('phone_number', phone_number)
      .eq('code', code)
      .eq('used', false)
      .gt('expires_at', new Date().toISOString())
      .maybeSingle();

    if (otpError) {
      console.error('Error fetching OTP:', otpError);
      return new Response(
        JSON.stringify({ error: 'Failed to verify code' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!otpRecord) {
      return new Response(
        JSON.stringify({ error: 'Invalid or expired verification code' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Mark OTP as used
    await supabase
      .from('otp_codes')
      .update({ used: true })
      .eq('id', otpRecord.id);

    // If user is already authenticated, they're just verifying their phone
    // Return success - the frontend will handle updating the profile
    if (authenticatedUserId) {
      console.log(`Phone verified for existing user: ${authenticatedUserId}`);
      return new Response(
        JSON.stringify({ 
          success: true, 
          isNewUser: false,
          phoneVerified: true,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // For unauthenticated requests, check if user exists with this phone number

    // Mark OTP as used
    await supabase
      .from('otp_codes')
      .update({ used: true })
      .eq('id', otpRecord.id);

    // Check if user exists with this phone number
    const { data: existingProfile } = await supabase
      .from('profiles')
      .select('user_id, display_name')
      .eq('phone_number', phone_number)
      .maybeSingle();

    let userId: string;
    let isNewUser = false;

    if (existingProfile) {
      // Existing user - just return their info
      userId = existingProfile.user_id;
      console.log(`Existing user found: ${userId}`);
    } else {
      // New user - need username
      if (!username) {
        return new Response(
          JSON.stringify({ error: 'Username is required for new users', needsUsername: true }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Create new user with email based on phone
      const email = `${phone_number.replace(/\+/g, '')}@wc2026predictor.app`;
      const password = `wc2026_${phone_number}_${Date.now()}`;

      const { data: authData, error: authError } = await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: {
          display_name: username,
          phone_number,
        },
      });

      if (authError) {
        console.error('Error creating user:', authError);
        return new Response(
          JSON.stringify({ error: 'Failed to create account' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      userId = authData.user.id;
      isNewUser = true;

      // Update profile with phone number (profile is auto-created by trigger)
      await supabase
        .from('profiles')
        .update({ phone_number })
        .eq('user_id', userId);

      console.log(`New user created: ${userId}`);
    }

    // Generate a session for the user
    // We'll use signInWithPassword with a magic link approach
    // Actually, let's generate a custom token approach
    
    // Get the user's email for signing in
    const { data: userData } = await supabase.auth.admin.getUserById(userId);
    
    if (!userData?.user?.email) {
      return new Response(
        JSON.stringify({ error: 'User account error' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Generate a magic link token for passwordless sign-in
    const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
      type: 'magiclink',
      email: userData.user.email,
    });

    if (linkError || !linkData) {
      console.error('Error generating link:', linkError);
      return new Response(
        JSON.stringify({ error: 'Failed to authenticate' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Extract the token from the link
    const url = new URL(linkData.properties.action_link);
    const token = url.searchParams.get('token');
    const tokenType = url.searchParams.get('type');

    return new Response(
      JSON.stringify({ 
        success: true, 
        isNewUser,
        token,
        tokenType,
        email: userData.user.email,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in verify-otp:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
