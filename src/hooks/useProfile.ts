import { useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/apiClient';

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

// 'unauthorized' — the access token is stale/invalid; the only useful
// action is a fresh login. 'failed' — anything else (network blip, 5xx);
// retrying may work. Consumers MUST branch on this instead of silently
// rendering an empty profile: a customer (SCHÄFER Werke, June 2026) saw
// the hollow logged-in shell — placeholder name + zeroed stats — and
// reported it as "the app shows the wrong name".
export type ProfileError = 'unauthorized' | 'failed' | null;

export const useProfile = (userId?: string) => {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ProfileError>(null);

  useEffect(() => {
    if (userId) {
      fetchProfile();
    } else {
      setProfile(null);
      setError(null);
      setLoading(false);
    }
  }, [userId]);

  const fetchProfile = async () => {
    if (!userId) return;

    setLoading(true);
    setError(null);
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
      } else {
        // 2xx with an empty body — token valid but no profile row.
        // Treat like a failure so the UI offers re-login (a fresh OIDC
        // round-trip recreates the profile via upsertOidcUser).
        setError('failed');
      }
    } catch (err) {
      setError(
        err instanceof ApiError && (err.status === 401 || err.status === 403)
          ? 'unauthorized'
          : 'failed',
      );
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

  return { profile, loading, error, updateAvatar, updatePhoneNumber, refetch: fetchProfile };
};
