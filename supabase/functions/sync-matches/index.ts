import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Football-Data.org API
const FOOTBALL_API_BASE = 'https://api.football-data.org/v4';

// FIFA World Cup 2026 competition code (use WC for World Cup)
const COMPETITION_CODE = 'WC';

interface FootballDataMatch {
  id: number;
  utcDate: string;
  status: string;
  matchday: number;
  stage: string;
  group: string | null;
  homeTeam: {
    id: number;
    name: string;
    shortName: string;
    tla: string;
    crest: string;
  };
  awayTeam: {
    id: number;
    name: string;
    shortName: string;
    tla: string;
    crest: string;
  };
  score: {
    fullTime: {
      home: number | null;
      away: number | null;
    };
  };
  venue: string | null;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const footballApiKey = Deno.env.get('FOOTBALL_DATA_API_KEY');
    if (!footballApiKey) {
      throw new Error('Football API key not configured');
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log('Fetching matches from Football-Data.org...');

    // Fetch matches from Football-Data.org
    const response = await fetch(`${FOOTBALL_API_BASE}/competitions/${COMPETITION_CODE}/matches`, {
      headers: {
        'X-Auth-Token': footballApiKey,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Football API error:', response.status, errorText);
      
      // If competition not found (WC 2026 might not be available yet), return demo data
      if (response.status === 404) {
        return new Response(
          JSON.stringify({ 
            message: 'World Cup 2026 data not yet available in API. Using local data.',
            matchesUpdated: 0,
            status: 'pending'
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      throw new Error(`Football API returned ${response.status}: ${errorText}`);
    }

    const data = await response.json();
    const matches: FootballDataMatch[] = data.matches || [];

    console.log(`Received ${matches.length} matches from API`);

    // Process and upsert matches
    let updatedCount = 0;
    for (const match of matches) {
      const matchId = generateMatchId(match);
      
      const { error } = await supabase
        .from('live_matches')
        .upsert({
          match_id: matchId,
          api_match_id: match.id,
          home_team_name: match.homeTeam.name,
          home_team_code: match.homeTeam.tla || match.homeTeam.shortName?.substring(0, 3).toUpperCase() || 'TBD',
          away_team_name: match.awayTeam.name,
          away_team_code: match.awayTeam.tla || match.awayTeam.shortName?.substring(0, 3).toUpperCase() || 'TBD',
          home_score: match.score.fullTime.home,
          away_score: match.score.fullTime.away,
          match_date: match.utcDate,
          venue: match.venue,
          stage: mapStage(match.stage),
          group_name: match.group,
          status: match.status,
          last_updated: new Date().toISOString(),
        }, {
          onConflict: 'match_id',
        });

      if (error) {
        console.error('Error upserting match:', matchId, error);
      } else {
        updatedCount++;
      }
    }

    console.log(`Successfully updated ${updatedCount} matches`);

    return new Response(
      JSON.stringify({ 
        message: 'Matches synced successfully',
        matchesUpdated: updatedCount,
        totalMatches: matches.length
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in sync-matches:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

function generateMatchId(match: FootballDataMatch): string {
  // Create a consistent match ID based on teams and stage
  const homeCode = match.homeTeam.tla || 'TBD';
  const awayCode = match.awayTeam.tla || 'TBD';
  const stage = match.stage || 'GROUP';
  const group = match.group || '';
  
  return `${stage}-${group}-${homeCode}-${awayCode}-${match.matchday}`.replace(/\s/g, '');
}

function mapStage(apiStage: string): string {
  const stageMap: Record<string, string> = {
    'GROUP_STAGE': 'group',
    'LAST_16': 'round16',
    'QUARTER_FINALS': 'quarter',
    'SEMI_FINALS': 'semi',
    'THIRD_PLACE': 'third',
    'FINAL': 'final',
  };
  return stageMap[apiStage] || 'group';
}
