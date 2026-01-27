import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface LeaderboardEntry {
  rank: number;
  userId: string;
  displayName: string;
  avatarEmoji: string;
  totalPredictions: number;
  points: number;
}

export const useLeaderboard = () => {
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchLeaderboard();
  }, []);

  const fetchLeaderboard = async () => {
    setLoading(true);
    
    // Get all predictions grouped by user
    const { data: predictions, error: predictionsError } = await supabase
      .from('predictions')
      .select('user_id');

    if (predictionsError) {
      setLoading(false);
      return;
    }

    // Count predictions per user
    const userCounts: Record<string, number> = {};
    predictions?.forEach(p => {
      userCounts[p.user_id] = (userCounts[p.user_id] || 0) + 1;
    });

    // Get profiles for these users
    const userIds = Object.keys(userCounts);
    if (userIds.length === 0) {
      setLeaderboard([]);
      setLoading(false);
      return;
    }

    const { data: profiles, error: profilesError } = await supabase
      .from('profiles')
      .select('*')
      .in('user_id', userIds);

    if (profilesError) {
      setLoading(false);
      return;
    }

    // Build leaderboard (for now, points = predictions count since no matches finished)
    const entries: LeaderboardEntry[] = (profiles || []).map(profile => ({
      rank: 0,
      userId: profile.user_id,
      displayName: profile.display_name,
      avatarEmoji: profile.avatar_emoji || '👤',
      totalPredictions: userCounts[profile.user_id] || 0,
      points: 0, // Will be calculated when matches are finished
    }));

    // Sort by predictions count for now
    entries.sort((a, b) => b.totalPredictions - a.totalPredictions);
    entries.forEach((entry, index) => {
      entry.rank = index + 1;
    });

    setLeaderboard(entries);
    setLoading(false);
  };

  return { leaderboard, loading, refetch: fetchLeaderboard };
};
