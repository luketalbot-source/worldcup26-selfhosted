import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { User } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import { Header } from '@/components/Header';
import { z } from 'zod';

const usernameSchema = z.string()
  .min(2, 'Username must be at least 2 characters')
  .max(20, 'Username must be 20 characters or less')
  .regex(/^[a-zA-Z0-9_]+$/, 'Username can only contain letters, numbers, and underscores');

const REMEMBERED_USERNAME_KEY = 'wc2026_remembered_username';

const Auth = () => {
  const [username, setUsername] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const { loginWithUsername } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  // Load remembered username on mount
  useEffect(() => {
    const savedUsername = localStorage.getItem(REMEMBERED_USERNAME_KEY);
    if (savedUsername) {
      setUsername(savedUsername);
      setRememberMe(true);
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      // Validate username
      const usernameResult = usernameSchema.safeParse(username);
      if (!usernameResult.success) {
        toast({ 
          title: 'Invalid username', 
          description: usernameResult.error.errors[0].message, 
          variant: 'destructive' 
        });
        setIsLoading(false);
        return;
      }

      const { error, isNewUser } = await loginWithUsername(username);
      
      if (error) {
        toast({ 
          title: 'Login failed', 
          description: error.message, 
          variant: 'destructive' 
        });
      } else {
        // Save or clear remembered username based on checkbox
        if (rememberMe) {
          localStorage.setItem(REMEMBERED_USERNAME_KEY, username);
        } else {
          localStorage.removeItem(REMEMBERED_USERNAME_KEY);
        }
        
        toast({ 
          title: isNewUser ? 'Welcome!' : 'Welcome back!', 
          description: isNewUser 
            ? `Account created for ${username}. Start predicting!` 
            : `Good to see you again, ${username}!`
        });
        navigate('/');
      }
    } catch (error) {
      toast({ 
        title: 'Error', 
        description: 'An unexpected error occurred.', 
        variant: 'destructive' 
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <main className="container py-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-sm mx-auto"
        >
          {/* Title */}
          <div className="text-center mb-8">
            <h2 className="text-2xl font-bold text-foreground mb-2">
              Enter Your Username
            </h2>
            <p className="text-muted-foreground">
              Just pick a username to start predicting!
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Username</label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                <Input
                  type="text"
                  placeholder="YourUsername"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="pl-10 h-12 rounded-xl"
                  autoComplete="username"
                  autoFocus
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Letters, numbers, and underscores only
              </p>
            </div>

            <div className="flex items-center space-x-2">
              <Checkbox 
                id="remember" 
                checked={rememberMe}
                onCheckedChange={(checked) => setRememberMe(checked === true)}
              />
              <label 
                htmlFor="remember" 
                className="text-sm text-muted-foreground cursor-pointer select-none"
              >
                Remember my username
              </label>
            </div>

            <Button
              type="submit"
              disabled={isLoading || !username.trim()}
              className="w-full h-12 rounded-xl bg-accent hover:bg-accent/90 text-accent-foreground font-semibold text-base"
            >
              {isLoading ? 'Please wait...' : 'Let\'s Go! 🚀'}
            </Button>
          </form>

        </motion.div>
      </main>
    </div>
  );
};

export default Auth;
