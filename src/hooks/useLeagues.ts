import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';

export interface League {
  id: string;
  name: string;
  avatar_emoji: string;
  join_code: string;
  creator_id: string;
  created_at: string;
  member_count?: number;
}

export interface LeagueMember {
  user_id: string;
  joined_at: string;
  display_name?: string;
  avatar_emoji?: string;
}

const generateJoinCode = (): string => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
};

export const useLeagues = () => {
  const { user } = useAuth();
  const { t } = useTranslation();
  const [leagues, setLeagues] = useState<League[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchLeagues = async () => {
    if (!user) {
      setLeagues([]);
      setLoading(false);
      return;
    }

    try {
      // Get leagues user is a member of
      const { data: memberData, error: memberError } = await supabase
        .from('league_members')
        .select('league_id')
        .eq('user_id', user.id);

      if (memberError) throw memberError;

      const leagueIds = memberData?.map(m => m.league_id) || [];

      if (leagueIds.length === 0) {
        setLeagues([]);
        setLoading(false);
        return;
      }

      const { data: leaguesData, error: leaguesError } = await supabase
        .from('leagues')
        .select('*')
        .in('id', leagueIds);

      if (leaguesError) throw leaguesError;

      // Get member counts for each league
      const leaguesWithCounts = await Promise.all(
        (leaguesData || []).map(async (league) => {
          const { count } = await supabase
            .from('league_members')
            .select('*', { count: 'exact', head: true })
            .eq('league_id', league.id);
          return { ...league, member_count: count || 0 };
        })
      );

      setLeagues(leaguesWithCounts);
    } catch (error) {
      console.error('Error fetching leagues:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLeagues();
  }, [user]);

  const createLeague = async (name: string, avatarEmoji: string): Promise<League | null> => {
    if (!user) return null;

    try {
      const joinCode = generateJoinCode();
      
      const { data, error } = await supabase
        .from('leagues')
        .insert({
          name,
          avatar_emoji: avatarEmoji,
          join_code: joinCode,
          creator_id: user.id
        })
        .select()
        .single();

      if (error) throw error;

      // Auto-join the creator to the league
      await supabase
        .from('league_members')
        .insert({
          league_id: data.id,
          user_id: user.id
        });

      toast.success(t('leagues.created'));
      await fetchLeagues();
      return data;
    } catch (error) {
      console.error('Error creating league:', error);
      toast.error(t('leagues.createError'));
      return null;
    }
  };

  const joinLeague = async (joinCode: string): Promise<boolean> => {
    if (!user) return false;

    try {
      // Look up league by code using security definer function
      const { data: leagueData, error: lookupError } = await supabase
        .rpc('get_league_by_code', { code: joinCode.toUpperCase() });

      if (lookupError) throw lookupError;

      if (!leagueData || leagueData.length === 0) {
        toast.error(t('leagues.invalidCode'));
        return false;
      }

      const league = leagueData[0];

      // Check if already a member
      const { data: existingMember } = await supabase
        .from('league_members')
        .select('id')
        .eq('league_id', league.id)
        .eq('user_id', user.id)
        .maybeSingle();

      if (existingMember) {
        toast.error(t('leagues.alreadyMember'));
        return false;
      }

      // Join the league
      const { error: joinError } = await supabase
        .from('league_members')
        .insert({
          league_id: league.id,
          user_id: user.id
        });

      if (joinError) throw joinError;

      toast.success(t('leagues.joined', { name: league.name }));
      await fetchLeagues();
      return true;
    } catch (error) {
      console.error('Error joining league:', error);
      toast.error(t('leagues.joinError'));
      return false;
    }
  };

  const leaveLeague = async (leagueId: string): Promise<boolean> => {
    if (!user) return false;

    try {
      const { error } = await supabase
        .from('league_members')
        .delete()
        .eq('league_id', leagueId)
        .eq('user_id', user.id);

      if (error) throw error;

      toast.success(t('leagues.left'));
      await fetchLeagues();
      return true;
    } catch (error) {
      console.error('Error leaving league:', error);
      toast.error(t('leagues.leaveError'));
      return false;
    }
  };

  const removeMember = async (leagueId: string, memberId: string): Promise<boolean> => {
    if (!user) return false;

    try {
      const { error } = await supabase
        .from('league_members')
        .delete()
        .eq('league_id', leagueId)
        .eq('user_id', memberId);

      if (error) throw error;

      toast.success(t('leagues.memberRemoved'));
      return true;
    } catch (error) {
      console.error('Error removing member:', error);
      toast.error(t('leagues.removeMemberError'));
      return false;
    }
  };

  const deleteLeague = async (leagueId: string): Promise<boolean> => {
    if (!user) return false;

    try {
      const { error } = await supabase
        .from('leagues')
        .delete()
        .eq('id', leagueId)
        .eq('creator_id', user.id);

      if (error) throw error;

      toast.success(t('leagues.deleted'));
      await fetchLeagues();
      return true;
    } catch (error) {
      console.error('Error deleting league:', error);
      toast.error(t('leagues.deleteError'));
      return false;
    }
  };

  const updateLeague = async (leagueId: string, name: string, avatarEmoji: string): Promise<boolean> => {
    if (!user) return false;

    try {
      const { error } = await supabase
        .from('leagues')
        .update({
          name,
          avatar_emoji: avatarEmoji
        })
        .eq('id', leagueId)
        .eq('creator_id', user.id);

      if (error) throw error;

      toast.success(t('leagues.updated'));
      await fetchLeagues();
      return true;
    } catch (error) {
      console.error('Error updating league:', error);
      toast.error(t('leagues.updateError'));
      return false;
    }
  };

  const getLeagueMembers = async (leagueId: string): Promise<LeagueMember[]> => {
    try {
      const { data: members, error } = await supabase
        .from('league_members')
        .select('user_id, joined_at')
        .eq('league_id', leagueId);

      if (error) throw error;

      // Get profiles for members
      const userIds = members?.map(m => m.user_id) || [];
      const { data: profiles } = await supabase
        .from('profiles')
        .select('user_id, display_name, avatar_emoji')
        .in('user_id', userIds);

      return (members || []).map(member => {
        const profile = profiles?.find(p => p.user_id === member.user_id);
        return {
          ...member,
          display_name: profile?.display_name,
          avatar_emoji: profile?.avatar_emoji
        };
      });
    } catch (error) {
      console.error('Error fetching league members:', error);
      return [];
    }
  };

  return {
    leagues,
    loading,
    createLeague,
    joinLeague,
    leaveLeague,
    removeMember,
    deleteLeague,
    updateLeague,
    getLeagueMembers,
    refetch: fetchLeagues
  };
};
