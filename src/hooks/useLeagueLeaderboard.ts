import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { calculatePredictionPoints } from '@/lib/scoringCalculator';
import { groupStageMatches } from '@/data/matches';

interface LeagueLeaderboardEntry {
  rank: number;
  userId: string;
  displayName: string;
  avatarEmoji: string;
  totalPredictions: number;
  points: number;
  isCreator: boolean;
}

export const useLeagueLeaderboard = (leagueId: string | null, creatorId: string | null) => {
  const [leaderboard, setLeaderboard] = useState<LeagueLeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (leagueId) {
      fetchLeaderboard();
    }
  }, [leagueId]);

  const fetchLeaderboard = async () => {
    if (!leagueId) return;
    
    setLoading(true);

    // Get league members
    const { data: members, error: membersError } = await supabase
      .from('league_members')
      .select('user_id')
      .eq('league_id', leagueId);

    if (membersError || !members?.length) {
      setLeaderboard([]);
      setLoading(false);
      return;
    }

    const memberIds = members.map(m => m.user_id);

    // Get predictions for these members
    const { data: predictions, error: predictionsError } = await supabase
      .from('predictions')
      .select('user_id, match_id, home_score, away_score')
      .in('user_id', memberIds);

    if (predictionsError) {
      console.error('Error fetching predictions:', predictionsError);
    }

    // Get boost predictions for these members
    const { data: boostPredictions, error: boostError } = await supabase
      .from('boost_predictions')
      .select('user_id')
      .in('user_id', memberIds);

    if (boostError) {
      console.error('Error fetching boost predictions:', boostError);
    }

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

    // Calculate points and prediction counts per user
    const userStats: Record<string, { points: number; predictions: number }> = {};
    
    // Initialize all members with 0 stats
    memberIds.forEach(userId => {
      userStats[userId] = { points: 0, predictions: 0 };
    });
    
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

    // Add boost predictions to the count
    boostPredictions?.forEach(p => {
      if (userStats[p.user_id]) {
        userStats[p.user_id].predictions++;
      }
    });

    // Get profiles for league members using secure view (excludes phone numbers)
    const { data: profiles, error: profilesError } = await supabase
      .from('profiles_public')
      .select('*')
      .in('user_id', memberIds);

    if (profilesError) {
      setLoading(false);
      return;
    }

    // Build leaderboard with actual points
    const entries: LeagueLeaderboardEntry[] = (profiles || []).map(profile => ({
      rank: 0,
      userId: profile.user_id,
      displayName: profile.display_name,
      avatarEmoji: profile.avatar_emoji || '👤',
      totalPredictions: userStats[profile.user_id]?.predictions || 0,
      points: userStats[profile.user_id]?.points || 0,
      isCreator: profile.user_id === creatorId,
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
