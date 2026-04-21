import { useState, useEffect } from 'react';
import { api } from '@/lib/apiClient';
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

export const useLeagues = (tenantId?: string | null) => {
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
      const params: Record<string, string | undefined> = {};
      if (tenantId) params.tenant_id = tenantId;

      const { data, error } = await api.get<League[]>('/leagues', params);

      if (error) throw error;

      setLeagues(data || []);
    } catch (error) {
      console.error('Error fetching leagues:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLeagues();
  }, [user, tenantId]);

  const createLeague = async (name: string, avatarEmoji: string): Promise<League | null> => {
    if (!user) return null;

    try {
      const joinCode = generateJoinCode();

      const { data, error } = await api.post<{ id: string }>('/leagues', {
        name,
        avatar_emoji: avatarEmoji,
        join_code: joinCode,
        ...(tenantId ? { tenant_id: tenantId } : {}),
      });

      if (error) throw error;

      toast.success(t('leagues.created'));
      await fetchLeagues();

      // Return a minimal League object — fetchLeagues will have updated state
      return leagues.find(l => l.id === data?.id) || null;
    } catch (error) {
      console.error('Error creating league:', error);
      toast.error(t('leagues.createError'));
      return null;
    }
  };

  const joinLeague = async (joinCode: string): Promise<boolean> => {
    if (!user) return false;

    try {
      // Look up league by code
      const { data: leagueData, error: lookupError } = await api.get<League>(
        `/leagues/by-code/${joinCode.toUpperCase()}`
      );

      if (lookupError) throw lookupError;

      if (!leagueData) {
        toast.error(t('leagues.invalidCode'));
        return false;
      }

      // Join the league
      const { error: joinError } = await api.post(`/leagues/${leagueData.id}/members`, {
        ...(tenantId ? { tenant_id: tenantId } : {}),
      });

      if (joinError) {
        // If already a member, the API should return an error we can check
        if (joinError.message?.includes('already')) {
          toast.error(t('leagues.alreadyMember'));
          return false;
        }
        throw joinError;
      }

      toast.success(t('leagues.joined', { name: leagueData.name }));
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
      const { error } = await api.delete(`/leagues/${leagueId}/members`);

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
      const { error } = await api.delete(`/leagues/${leagueId}/members/${memberId}`);

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
      const { error } = await api.delete(`/leagues/${leagueId}`);

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
      const { error } = await api.patch(`/leagues/${leagueId}`, {
        name,
        avatar_emoji: avatarEmoji,
      });

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
      const { data, error } = await api.get<LeagueMember[]>(`/leagues/${leagueId}/members`);

      if (error) throw error;

      return data || [];
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
