import { useState, useEffect } from 'react';
import { api, ApiError } from '@/lib/apiClient';
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
  // Scoring scope: null = overall (points from every competition
  // combined); a competition id = only that competition's points count.
  // The leaderboard endpoint applies the scope automatically.
  competition_id?: string | null;
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

      const data = await api.get<League[]>('/leagues', params);
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

  const createLeague = async (
    name: string,
    avatarEmoji: string,
    competitionId?: string | null,
  ): Promise<League | null> => {
    if (!user) return null;

    try {
      const joinCode = generateJoinCode();

      // The backend returns the full inserted row — use that directly.
      // Previous code did `leagues.find(...)` over a stale closure, which
      // returned null and prevented the modal from advancing to the
      // success state, so users could spam-create duplicates.
      const created = await api.post<League>('/leagues', {
        name,
        avatar_emoji: avatarEmoji,
        join_code: joinCode,
        ...(tenantId ? { tenant_id: tenantId } : {}),
        ...(competitionId ? { competition_id: competitionId } : {}),
      });

      toast.success(t('leagues.created'));
      await fetchLeagues();

      return created ?? null;
    } catch (error) {
      console.error('Error creating league:', error);
      toast.error(t('leagues.createError'));
      return null;
    }
  };

  const joinLeague = async (joinCode: string): Promise<boolean> => {
    if (!user) return false;

    try {
      const leagueData = await api.get<League>(`/leagues/by-code/${joinCode.toUpperCase()}`);

      if (!leagueData) {
        toast.error(t('leagues.invalidCode'));
        return false;
      }

      try {
        await api.post(`/leagues/${leagueData.id}/members`, {
          ...(tenantId ? { tenant_id: tenantId } : {}),
        });
      } catch (joinError) {
        if (joinError instanceof ApiError && joinError.message?.includes('already')) {
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
      await api.delete(`/leagues/${leagueId}/members`);
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
      await api.delete(`/leagues/${leagueId}/members/${memberId}`);
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
      await api.delete(`/leagues/${leagueId}`);
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
      await api.patch(`/leagues/${leagueId}`, {
        name,
        avatar_emoji: avatarEmoji,
      });

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
      return await api.get<LeagueMember[]>(`/leagues/${leagueId}/members`) || [];
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
