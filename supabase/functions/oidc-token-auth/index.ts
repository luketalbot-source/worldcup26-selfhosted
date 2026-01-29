import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

interface TokenAuthRequest {
  id_token: string;
  tenant_id: string;
  username?: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { id_token, tenant_id, username }: TokenAuthRequest = await req.json();

    if (!id_token || !tenant_id) {
      return new Response(
        JSON.stringify({ error: 'Missing required parameters' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Initialize Supabase client with service role
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Decode the ID token (JWT) to get claims
    // Note: In production, you should verify the token signature using JWKS
    const tokenParts = id_token.split('.');
    if (tokenParts.length !== 3) {
      return new Response(
        JSON.stringify({ error: 'Invalid ID token format' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const payload = JSON.parse(atob(tokenParts[1]));
    const oidcSubject = payload.sub;
    const oidcEmail = payload.email;
    const oidcName = payload.name || payload.preferred_username;
    const oidcIssuer = payload.iss;

    if (!oidcSubject) {
      return new Response(
        JSON.stringify({ error: 'No subject claim in ID token' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Token auth - OIDC subject: ${oidcSubject}, email: ${oidcEmail}, name: ${oidcName}`);

    // Verify tenant exists
    const { data: tenantData, error: tenantError } = await supabase
      .from('tenants')
      .select('id')
      .eq('id', tenant_id)
      .single();

    if (tenantError || !tenantData) {
      return new Response(
        JSON.stringify({ error: 'Invalid tenant' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if this OIDC identity already exists
    const { data: existingIdentity } = await supabase
      .from('oidc_identities')
      .select('user_id')
      .eq('tenant_id', tenant_id)
      .eq('oidc_subject', oidcSubject)
      .single();

    let userId: string;
    let isNewUser = false;

    if (existingIdentity) {
      userId = existingIdentity.user_id;
      console.log(`Existing OIDC user found: ${userId}`);
    } else {
      // New user - username is required
      const displayName = username || oidcName;
      if (!displayName) {
        return new Response(
          JSON.stringify({ 
            error: 'Username is required for new users',
            needsUsername: true,
            suggestedName: oidcName || oidcEmail?.split('@')[0],
          }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Create new user
      const shortSubject = oidcSubject.replace(/-/g, '').substring(0, 16);
      const shortTenant = tenant_id.replace(/-/g, '').substring(0, 8);
      const email = oidcEmail || `${shortSubject}@oidc-${shortTenant}.local`;
      const password = crypto.randomUUID();

      console.log('Creating user with email:', email);

      const { data: authData, error: authError } = await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: {
          display_name: displayName,
          oidc_subject: oidcSubject,
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

      // Update profile with tenant_id
      await supabase
        .from('profiles')
        .update({ tenant_id })
        .eq('user_id', userId);

      // Store OIDC identity mapping
      await supabase
        .from('oidc_identities')
        .insert({
          user_id: userId,
          tenant_id,
          oidc_subject: oidcSubject,
          oidc_issuer: oidcIssuer,
        });

      console.log(`New OIDC user created: ${userId}`);
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

    const url = new URL(linkData.properties.action_link);
    const token = url.searchParams.get('token');
    const tokenType = url.searchParams.get('type');

    return new Response(
      JSON.stringify({
        success: true,
        isNewUser,
        token,
        tokenType,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in oidc-token-auth:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
