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

    console.log(`Looking for unconsented SSO users created before ${cutoffTime.toISOString()}`);

    // Get OIDC users who haven't consented
    const { data: unconsentedIdentities, error: fetchError } = await supabase
      .from('oidc_identities')
      .select(`
        user_id,
        created_at
      `)
      .lt('created_at', cutoffTime.toISOString());

    if (fetchError) {
      console.error('Error fetching OIDC identities:', fetchError);
      throw fetchError;
    }

    if (!unconsentedIdentities || unconsentedIdentities.length === 0) {
      console.log('No OIDC users to check');
      return new Response(
        JSON.stringify({ message: 'No users to process', deleted: 0 }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const userIds = unconsentedIdentities.map(i => i.user_id);
    console.log(`Found ${userIds.length} OIDC users created before cutoff`);

    // Check which of these users have NOT consented
    const { data: profiles, error: profileError } = await supabase
      .from('profiles')
      .select('user_id, privacy_consent_at')
      .in('user_id', userIds)
      .is('privacy_consent_at', null);

    if (profileError) {
      console.error('Error fetching profiles:', profileError);
      throw profileError;
    }

    if (!profiles || profiles.length === 0) {
      console.log('All OIDC users have consented');
      return new Response(
        JSON.stringify({ message: 'All users have consented', deleted: 0 }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const usersToDelete = profiles.map(p => p.user_id);
    console.log(`Found ${usersToDelete.length} unconsented SSO users to delete`);

    // Delete the users (this will cascade to profiles and oidc_identities)
    let deletedCount = 0;
    for (const userId of usersToDelete) {
      console.log(`Deleting user ${userId}`);
      const { error: deleteError } = await supabase.auth.admin.deleteUser(userId);
      if (deleteError) {
        console.error(`Failed to delete user ${userId}:`, deleteError);
      } else {
        deletedCount++;
      }
    }

    console.log(`Successfully deleted ${deletedCount} unconsented SSO users`);

    return new Response(
      JSON.stringify({ 
        message: `Deleted ${deletedCount} unconsented SSO users`,
        deleted: deletedCount 
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in cleanup-unconsented-users:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
