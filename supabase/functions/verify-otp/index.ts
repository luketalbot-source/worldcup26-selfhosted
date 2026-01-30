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
    const { phone_number, code, username, tenant_id } = await req.json();
    
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

    // Check if user exists with this phone number and tenant_id
    let existingProfile = null;
    if (tenant_id) {
      // Tenant-specific login: find profile by phone + tenant
      const { data } = await supabase
        .from('profiles')
        .select('user_id, display_name')
        .eq('phone_number', phone_number)
        .eq('tenant_id', tenant_id)
        .maybeSingle();
      existingProfile = data;
    } else {
      // Admin login (no tenant): find any admin user with this phone number
      // First get all profiles with this phone number
      const { data: profiles } = await supabase
        .from('profiles')
        .select('user_id, display_name')
        .eq('phone_number', phone_number);
      
      if (profiles && profiles.length > 0) {
        // Check if any of these users has an admin role
        for (const profile of profiles) {
          const { data: roleData } = await supabase
            .from('user_roles')
            .select('role')
            .eq('user_id', profile.user_id)
            .in('role', ['admin', 'site_admin', 'tenant_admin'])
            .maybeSingle();
          
          if (roleData) {
            existingProfile = profile;
            console.log(`Admin user found: ${profile.user_id}, role: ${roleData.role}`);
            break;
          }
        }
        
        // If no admin found but profiles exist, use first one (for backwards compatibility)
        if (!existingProfile && profiles.length === 1) {
          existingProfile = profiles[0];
        }
      } else {
        // No profiles found - check if there's an admin user with this phone in auth.users metadata
        // This handles the case where an admin has no profile but was granted admin access
        const { data: authUsers, error: listError } = await supabase.auth.admin.listUsers();
        
        if (!listError && authUsers?.users) {
          for (const authUser of authUsers.users) {
            const metadata = authUser.user_metadata || {};
            if (metadata.phone_number === phone_number) {
              // Check if this user has an admin role
              const { data: roleData } = await supabase
                .from('user_roles')
                .select('role')
                .eq('user_id', authUser.id)
                .in('role', ['admin', 'site_admin', 'tenant_admin'])
                .maybeSingle();
              
              if (roleData) {
                existingProfile = { user_id: authUser.id, display_name: metadata.display_name || 'Admin' };
                console.log(`Admin user found via auth metadata: ${authUser.id}, role: ${roleData.role}`);
                break;
              }
            }
          }
        }
      }
    }

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
          tenant_id,
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

      // Update profile with phone number and tenant_id (profile is auto-created by trigger)
      const updateData: Record<string, unknown> = { phone_number };
      if (tenant_id) {
        updateData.tenant_id = tenant_id;
      }
      
      await supabase
        .from('profiles')
        .update(updateData)
        .eq('user_id', userId);

      console.log(`New user created: ${userId} for tenant: ${tenant_id}`);
    }

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
