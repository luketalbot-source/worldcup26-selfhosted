import { useEffect, useState } from 'react';
import { api } from '@/lib/apiClient';

export interface Profile {
  id: string;
  userId: string;
  displayName: string;
  avatarEmoji: string;
  phoneNumber: string | null;
}

interface ApiProfile {
  id: string;
  user_id: string;
  display_name: string;
  avatar_emoji: string | null;
  phone_number: string | null;
}

export const useProfile = (userId?: string) => {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (userId) {
      fetchProfile();
    } else {
      setProfile(null);
      setLoading(false);
    }
  }, [userId]);

  const fetchProfile = async () => {
    if (!userId) return;

    setLoading(true);
    try {
      const data = await api.get<ApiProfile>('/profiles/me');
      if (data) {
        setProfile({
          id: data.id,
          userId: data.user_id,
          displayName: data.display_name,
          avatarEmoji: data.avatar_emoji || '👤',
          phoneNumber: data.phone_number || null,
        });
      }
    } catch {
      // leave profile as-is on error
    } finally {
      setLoading(false);
    }
  };

  /**
   * Update only the avatar emoji. Display name is owned by the OIDC sync
   * path (see api/src/routes/auth.ts::upsertOidcUser) and cannot be changed
   * in-app — the backend PATCH schema rejects display_name outright.
   */
  const updateAvatar = async (avatarEmoji: string) => {
    if (!userId) return;

    try {
      await api.patch('/profiles/me', { avatar_emoji: avatarEmoji });
      if (profile) {
        setProfile({ ...profile, avatarEmoji });
      }
      return { error: null as Error | null };
    } catch (err) {
      return { error: err instanceof Error ? err : new Error(String(err)) };
    }
  };

  const updatePhoneNumber = async (phoneNumber: string) => {
    if (!userId) return;

    try {
      await api.patch('/profiles/me', { phone_number: phoneNumber });
      if (profile) {
        setProfile({ ...profile, phoneNumber });
      }
      return { error: null as Error | null };
    } catch (err) {
      return { error: err instanceof Error ? err : new Error(String(err)) };
    }
  };

  return { profile, loading, updateAvatar, updatePhoneNumber, refetch: fetchProfile };
};
