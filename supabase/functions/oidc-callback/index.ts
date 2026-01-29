import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface OIDCCallbackRequest {
  code: string;
  code_verifier: string;
  tenant_id: string;
  username?: string; // Required for new users
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { code, code_verifier, tenant_id, username }: OIDCCallbackRequest = await req.json();

    if (!code || !code_verifier || !tenant_id) {
      return new Response(
        JSON.stringify({ error: 'Missing required parameters' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Initialize Supabase client with service role
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Fetch tenant OIDC config
    const { data: oidcConfig, error: configError } = await supabase
      .from('tenant_oidc_config')
      .select('*')
      .eq('tenant_id', tenant_id)
      .single();

    if (configError || !oidcConfig) {
      console.error('OIDC config not found:', configError);
      return new Response(
        JSON.stringify({ error: 'OIDC configuration not found for this tenant' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Derive token endpoint from auth_url
    // Standard OIDC: replace /authorize with /token or use .well-known
    const authUrl = new URL(oidcConfig.auth_url);
    const tokenUrl = new URL(oidcConfig.auth_url);
    
    // Common OIDC pattern: /authorize -> /token
    if (authUrl.pathname.includes('/authorize')) {
      tokenUrl.pathname = authUrl.pathname.replace('/authorize', '/token');
    } else if (authUrl.pathname.includes('/auth')) {
      tokenUrl.pathname = authUrl.pathname.replace('/auth', '/token');
    } else {
      // Fallback: append /token to base
      tokenUrl.pathname = tokenUrl.pathname.replace(/\/?$/, '/token');
    }

    console.log(`Exchanging code at token endpoint: ${tokenUrl.toString()}`);

    // Exchange authorization code for tokens (PKCE flow - no client_secret needed)
    const tokenResponse = await fetch(tokenUrl.toString(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: oidcConfig.redirect_uri,
        client_id: oidcConfig.client_id,
        code_verifier,
      }).toString(),
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      console.error('Token exchange failed:', tokenResponse.status, errorText);
      return new Response(
        JSON.stringify({ error: 'Failed to exchange authorization code', details: errorText }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const tokenData = await tokenResponse.json();
    const idToken = tokenData.id_token;

    if (!idToken) {
      return new Response(
        JSON.stringify({ error: 'No ID token received from IDP' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Decode the ID token (JWT) to get claims
    // Note: In production, you should verify the token signature
    const tokenParts = idToken.split('.');
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

    console.log(`OIDC subject: ${oidcSubject}, email: ${oidcEmail}, name: ${oidcName}`);

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
      // Existing user
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

      // Create new user with email based on OIDC subject
      const email = oidcEmail || `${oidcSubject}@oidc.${tenant_id}.local`;
      const password = `oidc_${tenant_id}_${oidcSubject}_${Date.now()}`;

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
    console.error('Error in oidc-callback:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
