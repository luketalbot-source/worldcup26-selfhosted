import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { calculatePredictionPoints } from '@/lib/scoringCalculator';
import { groupStageMatches } from '@/data/matches';
import type { AuthMethod } from '@/contexts/TenantContext';

interface LeaderboardEntry {
  rank: number;
  userId: string;
  displayName: string;
  avatarEmoji: string;
  totalPredictions: number;
  points: number;
}

interface UseLeaderboardOptions {
  tenantId: string | null;
  authMethod?: AuthMethod;
}

export const useLeaderboard = (optionsOrTenantId: UseLeaderboardOptions | string | null) => {
  // Support both old (tenantId string) and new (options object) signatures
  const isOptionsObject = optionsOrTenantId !== null && typeof optionsOrTenantId === 'object';
  const tenantId: string | null = isOptionsObject 
    ? (optionsOrTenantId as UseLeaderboardOptions).tenantId 
    : (optionsOrTenantId as string | null);
  const authMethod: AuthMethod | undefined = isOptionsObject 
    ? (optionsOrTenantId as UseLeaderboardOptions).authMethod 
    : undefined;
  
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (tenantId) {
      fetchLeaderboard();
    }
  }, [tenantId, authMethod]);

  const fetchLeaderboard = async () => {
    if (!tenantId) {
      setLeaderboard([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    
    // For OIDC tenants, use the oidc-specific function that queries via oidc_identities
    // For OTP tenants, use the standard profile-based function
    let profiles: { id: string; user_id: string; display_name: string; avatar_emoji: string }[] | null = null;
    let profilesError: Error | null = null;
    
    if (authMethod === 'oidc') {
      const result = await supabase.rpc('get_oidc_tenant_profiles', { _tenant_id: tenantId });
      profiles = result.data;
      profilesError = result.error;
    } else {
      const result = await supabase.rpc('get_tenant_profiles', { _tenant_id: tenantId });
      profiles = result.data;
      profilesError = result.error;
    }

    if (profilesError) {
      console.error('Error fetching profiles:', profilesError);
      setLoading(false);
      return;
    }

    if (!profiles || profiles.length === 0) {
      setLeaderboard([]);
      setLoading(false);
      return;
    }

    const userIds = profiles.map(p => p.user_id);

    // Get all predictions with scores for these users IN THIS TENANT
    const { data: predictions, error: predictionsError } = await supabase
      .from('predictions')
      .select('user_id, match_id, home_score, away_score')
      .in('user_id', userIds)
      .eq('tenant_id', tenantId);

    if (predictionsError) {
      console.error('Error fetching predictions:', predictionsError);
    }

    // Get boost predictions for these users IN THIS TENANT
    const { data: boostPredictions, error: boostError } = await supabase
      .from('boost_predictions')
      .select('user_id, award_id, predicted_team_code, predicted_player_name')
      .in('user_id', userIds)
      .eq('tenant_id', tenantId);

    if (boostError) {
      console.error('Error fetching boost predictions:', boostError);
    }

    // Get custom boost predictions for these users IN THIS TENANT
    const { data: customBoostPredictions, error: customBoostError } = await supabase
      .from('tenant_custom_boost_predictions')
      .select('user_id, custom_boost_id, predicted_team_code, predicted_player_name')
      .in('user_id', userIds)
      .eq('tenant_id', tenantId);

    if (customBoostError) {
      console.error('Error fetching custom boost predictions:', customBoostError);
    }

    // Get boost awards and results for scoring
    const [awardsRes, resultsRes, customAwardsRes, customResultsRes] = await Promise.all([
      supabase.from('boost_awards').select('id, prediction_type, points_value'),
      supabase.from('boost_results').select('award_id, result_team_code, result_player_name'),
      supabase.from('tenant_custom_boosts').select('id, prediction_type, points_value').eq('tenant_id', tenantId),
      supabase.from('tenant_custom_boost_results').select('custom_boost_id, result_team_code, result_player_name'),
    ]);

    // Get all finished matches from live_matches (database)
    const { data: finishedMatches, error: matchesError } = await supabase
      .from('live_matches')
      .select('match_id, home_score, away_score, status')
      .in('status', ['FINISHED', 'FT', 'AET', 'PEN']);

    if (matchesError) {
      console.error('Error fetching matches:', matchesError);
    }

    // Create a map of finished matches for quick lookup
    const matchResults = new Map<string, { home_score: number | null; away_score: number | null }>();
    
    // Add matches from database
    finishedMatches?.forEach(match => {
      matchResults.set(match.match_id, {
        home_score: match.home_score,
        away_score: match.away_score,
      });
    });
    
    // Also add finished matches from static data (for test matches)
    groupStageMatches
      .filter(m => m.status === 'finished' && m.homeScore !== undefined && m.awayScore !== undefined)
      .forEach(match => {
        matchResults.set(match.id, {
          home_score: match.homeScore ?? null,
          away_score: match.awayScore ?? null,
        });
      });

    // Initialize all users with 0 stats
    const userStats: Record<string, { points: number; predictions: number }> = {};
    userIds.forEach(userId => {
      userStats[userId] = { points: 0, predictions: 0 };
    });

    // Calculate points and prediction counts per user
    predictions?.forEach(p => {
      if (!userStats[p.user_id]) {
        userStats[p.user_id] = { points: 0, predictions: 0 };
      }
      
      userStats[p.user_id].predictions++;
      
      // Calculate points if match is finished
      const match = matchResults.get(p.match_id);
      if (match && match.home_score !== null && match.away_score !== null) {
        const { points } = calculatePredictionPoints(
          p.home_score,
          p.away_score,
          match.home_score,
          match.away_score
        );
        userStats[p.user_id].points += points;
      }
    });

    // Add boost predictions to the count and calculate boost points
    const awards = awardsRes.data || [];
    const results = resultsRes.data || [];
    
    boostPredictions?.forEach(p => {
      if (userStats[p.user_id]) {
        userStats[p.user_id].predictions++;
        
        // Calculate boost points if result exists
        const result = results.find(r => r.award_id === p.award_id);
        const award = awards.find(a => a.id === p.award_id);
        
        if (result && award) {
          if (award.prediction_type === 'team') {
            if (p.predicted_team_code === result.result_team_code) {
              userStats[p.user_id].points += award.points_value;
            }
          } else {
            if (p.predicted_player_name === result.result_player_name) {
              userStats[p.user_id].points += award.points_value;
            }
          }
        }
      }
    });

    // Add custom boost predictions to the count and calculate points
    // Only count predictions for boosts that still exist (not deleted)
    const customAwards = customAwardsRes.data || [];
    const customResults = customResultsRes.data || [];
    const existingCustomBoostIds = new Set(customAwards.map(a => a.id));
    
    customBoostPredictions?.forEach(p => {
      // Only count predictions for boosts that still exist
      if (!existingCustomBoostIds.has(p.custom_boost_id)) {
        return;
      }
      
      if (userStats[p.user_id]) {
        userStats[p.user_id].predictions++;
        
        // Calculate custom boost points if result exists
        const result = customResults.find(r => r.custom_boost_id === p.custom_boost_id);
        const award = customAwards.find(a => a.id === p.custom_boost_id);
        
        if (result && award) {
          if (award.prediction_type === 'team') {
            if (p.predicted_team_code === result.result_team_code) {
              userStats[p.user_id].points += award.points_value;
            }
          } else {
            if (p.predicted_player_name === result.result_player_name) {
              userStats[p.user_id].points += award.points_value;
            }
          }
        }
      }
    });

    // Build leaderboard with actual points
    const entries: LeaderboardEntry[] = (profiles || []).map(profile => ({
      rank: 0,
      userId: profile.user_id,
      displayName: profile.display_name,
      avatarEmoji: profile.avatar_emoji || '👤',
      totalPredictions: userStats[profile.user_id]?.predictions || 0,
      points: userStats[profile.user_id]?.points || 0,
    }));

    // Sort by points (descending), then by predictions count as tiebreaker
    entries.sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points;
      return b.totalPredictions - a.totalPredictions;
    });
    
    entries.forEach((entry, index) => {
      entry.rank = index + 1;
    });

    setLeaderboard(entries);
    setLoading(false);
  };

  return { leaderboard, loading, refetch: fetchLeaderboard };
};
