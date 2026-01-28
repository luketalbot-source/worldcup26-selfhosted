import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface Profile {
  id: string;
  userId: string;
  displayName: string;
  avatarEmoji: string;
  phoneNumber: string | null;
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
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

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

    const updates: any = { display_name: displayName };
    if (avatarEmoji) updates.avatar_emoji = avatarEmoji;

    const { error } = await supabase
      .from('profiles')
      .update(updates)
      .eq('user_id', userId);

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

    const { error } = await supabase
      .from('profiles')
      .update({ phone_number: phoneNumber })
      .eq('user_id', userId);

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
