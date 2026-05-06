import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { api } from '@/lib/apiClient';
import { setAccessToken, clearAccessToken, getUser, onAuthChange, type AppUser } from '@/lib/auth';

interface AuthContextType {
  user: AppUser | null;
  loading: boolean;
  devLogin: () => Promise<{ error: Error | null }>;
  devTenantLogin: (tenantId: string) => Promise<{ error: Error | null }>;
  // Email-allowlist admin login — two-step.
  // start: send a 6-digit code to the given email (silently no-ops if email
  //        isn't on the server-side allowlist; UI doesn't tell the user)
  // verify: exchange (email, code) for an admin JWT
  adminLoginStart: (email: string) => Promise<{ error: Error | null }>;
  adminLoginVerify: (email: string, code: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthChange((u) => {
      setUser(u);
    });

    const storedUser = getUser();
    if (storedUser) {
      setUser(storedUser);
      setLoading(false);
    } else {
      // No stored token — try to refresh via httpOnly cookie
      api.post<{ access_token: string }>('/auth/refresh')
        .then((data) => {
          if (data?.access_token) {
            setAccessToken(data.access_token);
            // onAuthChange will update user state
          }
        })
        .catch(() => {
          // No refresh cookie or refresh failed — stay logged out
        })
        .finally(() => {
          setLoading(false);
        });
    }

    return () => {
      unsubscribe();
    };
  }, []);

  // Open-admin login for solo dev. Backend is gated by ADMIN_OPEN=1.
  const devLogin = async (): Promise<{ error: Error | null }> => {
    try {
      const data = await api.post<{ access_token: string }>('/auth/dev-login');
      if (data?.access_token) setAccessToken(data.access_token);
      return { error: null };
    } catch (err) {
      return { error: err instanceof Error ? err : new Error(String(err)) };
    }
  };

  // Open-tenant login for solo dev. Creates a demo user scoped to the tenant.
  const devTenantLogin = async (tenantId: string): Promise<{ error: Error | null }> => {
    try {
      const data = await api.post<{ access_token: string }>('/auth/dev-tenant-login', {
        tenant_id: tenantId,
      });
      if (data?.access_token) setAccessToken(data.access_token);
      return { error: null };
    } catch (err) {
      return { error: err instanceof Error ? err : new Error(String(err)) };
    }
  };

  // Email-allowlist admin login — backend handles allowlist + delivery.
  // The "start" call always returns ok regardless of whether the email is
  // allowlisted (no enumeration). "verify" returns 401 on bad code.
  const adminLoginStart = async (email: string): Promise<{ error: Error | null }> => {
    try {
      await api.post('/auth/admin-login/start', { email });
      return { error: null };
    } catch (err) {
      return { error: err instanceof Error ? err : new Error(String(err)) };
    }
  };

  const adminLoginVerify = async (
    email: string,
    code: string,
  ): Promise<{ error: Error | null }> => {
    try {
      const data = await api.post<{ access_token: string }>('/auth/admin-login/verify', {
        email,
        code,
      });
      if (data?.access_token) setAccessToken(data.access_token);
      return { error: null };
    } catch (err) {
      return { error: err instanceof Error ? err : new Error(String(err)) };
    }
  };

  const signOut = async () => {
    try { await api.post('/auth/signout'); } catch { /* best-effort */ }
    clearAccessToken();
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        devLogin,
        devTenantLogin,
        adminLoginStart,
        adminLoginVerify,
        signOut,
      }}
    >
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
