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
    const { data, error } = await api.get<ApiProfile>('/profiles/me');

    if (!error && data) {
      setProfile({
        id: data.id,
        userId: data.user_id,
        displayName: data.display_name,
        avatarEmoji: data.avatar_emoji || '👤',
        phoneNumber: data.phone_number || null,
      });
    }
    setLoading(false);
  };

  const updateProfile = async (displayName: string, avatarEmoji?: string) => {
    if (!userId) return;

    const updates: Record<string, string> = { display_name: displayName };
    if (avatarEmoji) updates.avatar_emoji = avatarEmoji;

    const { error } = await api.patch('/profiles/me', updates);

    if (!error && profile) {
      setProfile({
        ...profile,
        displayName,
        avatarEmoji: avatarEmoji || profile.avatarEmoji,
      });
    }

    return { error };
  };

  const updatePhoneNumber = async (phoneNumber: string) => {
    if (!userId) return;

    const { error } = await api.patch('/profiles/me', { phone_number: phoneNumber });

    if (!error && profile) {
      setProfile({
        ...profile,
        phoneNumber,
      });
    }

    return { error };
  };

  return { profile, loading, updateProfile, updatePhoneNumber, refetch: fetchProfile };
};
