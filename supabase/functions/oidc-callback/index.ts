import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  // Important: must include all headers the browser sends during preflight
  // otherwise the POST will be blocked and the client will show
  // "Failed to send a request to the Edge Function".
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
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
    // Standard OIDC: the auth URL typically ends with /auth or /authorize
    // and the token URL ends with /token
    const authUrl = new URL(oidcConfig.auth_url);
    const tokenUrl = new URL(oidcConfig.auth_url);
    
    // Replace only the LAST segment of the path
    // e.g., /auth/realms/show/protocol/openid-connect/auth -> /auth/realms/show/protocol/openid-connect/token
    const pathParts = authUrl.pathname.split('/');
    const lastPart = pathParts[pathParts.length - 1];
    
    if (lastPart === 'authorize' || lastPart === 'auth') {
      pathParts[pathParts.length - 1] = 'token';
      tokenUrl.pathname = pathParts.join('/');
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
      // Check if a user with this email already exists (from a different OIDC provider or tenant)
      let existingUserByEmail = null;
      if (oidcEmail) {
        const { data: usersByEmail } = await supabase.auth.admin.listUsers();
        existingUserByEmail = usersByEmail?.users?.find(u => u.email === oidcEmail);
      }

      if (existingUserByEmail) {
        // User exists with this email - link the new OIDC identity to them
        userId = existingUserByEmail.id;
        console.log(`Linking OIDC identity to existing user by email: ${userId}`);

        // Store OIDC identity mapping for this tenant
        const { error: linkError } = await supabase
          .from('oidc_identities')
          .insert({
            user_id: userId,
            tenant_id,
            oidc_subject: oidcSubject,
            oidc_issuer: oidcIssuer,
          });

        if (linkError) {
          console.error('Error linking OIDC identity:', linkError);
        }

        // Update profile with tenant_id if not set
        const { data: existingProfile } = await supabase
          .from('profiles')
          .select('tenant_id')
          .eq('user_id', userId)
          .single();

        if (!existingProfile?.tenant_id) {
          await supabase
            .from('profiles')
            .update({ 
              tenant_id,
              privacy_consent_at: new Date().toISOString(),
            })
            .eq('user_id', userId);
        }
      } else {
      // New user - username is required
        const displayName = username || oidcName;
        if (!displayName) {
          // Return the id_token so the frontend can retry with username without re-exchanging the code
          return new Response(
            JSON.stringify({ 
              error: 'Username is required for new users',
              needsUsername: true,
              suggestedName: oidcName || oidcEmail?.split('@')[0],
              id_token: idToken, // Include token for second attempt
            }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Create new user with email based on OIDC subject
        // Use a shorter, valid email format - hash the subject to keep it short
        const shortSubject = oidcSubject.replace(/-/g, '').substring(0, 16);
        const shortTenant = tenant_id.replace(/-/g, '').substring(0, 8);
        const email = oidcEmail || `${shortSubject}@oidc-${shortTenant}.local`;
        const password = crypto.randomUUID(); // Use a random UUID as password
        
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

        // Update profile with tenant_id and consent timestamp
        await supabase
          .from('profiles')
          .update({ 
            tenant_id,
            privacy_consent_at: new Date().toISOString(),
          })
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
