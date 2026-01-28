import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { User, Session, type EmailOtpType } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  sendOtp: (phoneNumber: string) => Promise<{ error: Error | null; isNewUser: boolean }>;
  verifyOtp: (phoneNumber: string, code: string, username?: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Set up auth state listener FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        setLoading(false);
      }
    );

    // THEN check for existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const sendOtp = async (phoneNumber: string): Promise<{ error: Error | null; isNewUser: boolean }> => {
    try {
      // Call the send-otp edge function (server-side check for isNewUser bypasses RLS)
      const { data, error } = await supabase.functions.invoke('send-otp', {
        body: { phone_number: phoneNumber },
      });

      if (error) {
        return { error: new Error(error.message || 'Failed to send OTP'), isNewUser: false };
      }

      if (data?.error) {
        return { error: new Error(data.error), isNewUser: false };
      }

      // Use the server-side isNewUser check result
      return { error: null, isNewUser: data?.isNewUser ?? false };
    } catch (err) {
      return { error: err as Error, isNewUser: false };
    }
  };

  const verifyOtp = async (
    phoneNumber: string, 
    code: string, 
    username?: string
  ): Promise<{ error: Error | null }> => {
    try {
      // Call the verify-otp edge function
      const { data, error } = await supabase.functions.invoke('verify-otp', {
        body: { phone_number: phoneNumber, code, username },
      });

      if (error) {
        return { error: new Error(error.message || 'Failed to verify OTP') };
      }

      if (data?.error) {
        return { error: new Error(data.error) };
      }

      if (data?.token) {
        // `admin.generateLink({ type: 'magiclink' })` returns a hashed token.
        // Supabase expects it as `token_hash` (not `token`) for verifyOtp.
        const type = (data.tokenType || 'magiclink') as EmailOtpType;

        const { error: verifyError } = await supabase.auth.verifyOtp({
          token_hash: data.token,
          type,
        });

        if (verifyError) {
          return { error: verifyError };
        }
      }

      return { error: null };
    } catch (err) {
      return { error: err as Error };
    }
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ user, session, loading, sendOtp, verifyOtp, signOut }}>
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
