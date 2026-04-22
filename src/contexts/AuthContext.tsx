import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { api } from '@/lib/apiClient';
import { getAccessToken, setAccessToken, clearAccessToken, getUser, onAuthChange, type AppUser } from '@/lib/auth';

interface AuthContextType {
  user: AppUser | null;
  loading: boolean;
  devLogin: () => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Subscribe to auth changes
    const unsubscribe = onAuthChange((u) => {
      setUser(u);
    });

    // Try to restore user from stored token first
    const storedUser = getUser();
    if (storedUser) {
      setUser(storedUser);
      setLoading(false);
    } else {
      // No stored token — try to refresh via httpOnly cookie
      api.post<{ access_token: string }>('/auth/refresh').then(({ data, error }) => {
        if (!error && data?.access_token) {
          setAccessToken(data.access_token);
          // onAuthChange will update user state
        }
        setLoading(false);
      });
    }

    return () => {
      unsubscribe();
    };
  }, []);

  // Open-admin login for solo dev. Backend is gated by ADMIN_OPEN=1.
  // When Entra SSO lands, this gets replaced with a proper OIDC flow.
  const devLogin = async (): Promise<{ error: Error | null }> => {
    const { data, error } = await api.post<{ access_token: string }>('/auth/dev-login');

    if (error) {
      return { error };
    }

    if (data?.access_token) {
      setAccessToken(data.access_token);
    }

    return { error: null };
  };

  const signOut = async () => {
    await api.post('/auth/signout');
    clearAccessToken();
  };

  return (
    <AuthContext.Provider value={{ user, loading, devLogin, signOut }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
