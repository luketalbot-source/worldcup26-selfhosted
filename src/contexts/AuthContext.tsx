import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  loginWithUsername: (username: string) => Promise<{ error: Error | null; isNewUser: boolean }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Generate a consistent "email" and password from username
const generateCredentials = (username: string) => {
  const normalizedUsername = username.toLowerCase().trim();
  const email = `${normalizedUsername}@wc2026predictor.app`;
  // Use a consistent password based on username (simple for this use case)
  const password = `wc2026_${normalizedUsername}_predictor`;
  return { email, password, displayName: username.trim() };
};

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

  const loginWithUsername = async (username: string): Promise<{ error: Error | null; isNewUser: boolean }> => {
    const { email, password, displayName } = generateCredentials(username);
    
    // First, try to sign in (existing user)
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    
    if (!signInError) {
      // Successfully signed in as existing user
      return { error: null, isNewUser: false };
    }
    
    // If sign in failed, try to create a new account
    if (signInError.message.includes('Invalid login credentials')) {
      const redirectUrl = `${window.location.origin}/`;
      
      const { error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: redirectUrl,
          data: {
            display_name: displayName,
          },
        },
      });
      
      if (signUpError) {
        return { error: signUpError as Error, isNewUser: false };
      }
      
      // Successfully created new user
      return { error: null, isNewUser: true };
    }
    
    // Some other error occurred
    return { error: signInError as Error, isNewUser: false };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ user, session, loading, loginWithUsername, signOut }}>
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
