import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Find SSO users (those with oidc_identities) who haven't consented
    // and were created more than 24 hours ago
    const cutoffTime = new Date();
    cutoffTime.setHours(cutoffTime.getHours() - 24);

    // Get OIDC users who haven't consented
    const { data: unconsentedIdentities, error: fetchError } = await supabase
      .from('oidc_identities')
      .select(`
        user_id,
        created_at
      `)
      .lt('created_at', cutoffTime.toISOString());

    if (fetchError) {
      throw fetchError;
    }

    if (!unconsentedIdentities || unconsentedIdentities.length === 0) {
      return new Response(
        JSON.stringify({ message: 'No users to process', deleted: 0 }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const userIds = unconsentedIdentities.map(i => i.user_id);

    // Check which of these users have NOT consented
    const { data: profiles, error: profileError } = await supabase
      .from('profiles')
      .select('user_id, privacy_consent_at')
      .in('user_id', userIds)
      .is('privacy_consent_at', null);

    if (profileError) {
      throw profileError;
    }

    if (!profiles || profiles.length === 0) {
      return new Response(
        JSON.stringify({ message: 'All users have consented', deleted: 0 }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const usersToDelete = profiles.map(p => p.user_id);

    // Delete the users (this will cascade to profiles and oidc_identities)
    let deletedCount = 0;
    for (const userId of usersToDelete) {
      const { error: deleteError } = await supabase.auth.admin.deleteUser(userId);
      if (deleteError) {
        // Error handled silently
      } else {
        deletedCount++;
      }
    }

    return new Response(
      JSON.stringify({ 
        message: `Deleted ${deletedCount} unconsented SSO users`,
        deleted: deletedCount 
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
