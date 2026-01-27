import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Trophy, User, ArrowLeft } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { z } from 'zod';

const usernameSchema = z.string()
  .min(2, 'Username must be at least 2 characters')
  .max(20, 'Username must be 20 characters or less')
  .regex(/^[a-zA-Z0-9_]+$/, 'Username can only contain letters, numbers, and underscores');

const Auth = () => {
  const [username, setUsername] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { loginWithUsername } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

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
      {/* Header */}
      <header className="gradient-navy text-white">
        <div className="container py-4">
          <motion.div 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center gap-3"
          >
            <button 
              onClick={() => navigate('/')} 
              className="p-2 -ml-2 rounded-lg hover:bg-white/10 transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="w-10 h-10 rounded-xl gradient-hero flex items-center justify-center shadow-glow">
              <Trophy className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight">WC 2026</h1>
              <p className="text-xs text-white/70">Predictor</p>
            </div>
          </motion.div>
        </div>
      </header>

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
              Just pick a username to start predicting. No password needed!
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

            <Button
              type="submit"
              disabled={isLoading || !username.trim()}
              className="w-full h-12 rounded-xl bg-accent hover:bg-accent/90 text-accent-foreground font-semibold text-base"
            >
              {isLoading ? 'Please wait...' : 'Let\'s Go! 🚀'}
            </Button>
          </form>

          {/* Info */}
          <div className="mt-6 p-4 rounded-xl bg-muted/50 border border-border">
            <p className="text-sm text-muted-foreground text-center">
              💡 <strong>Tip:</strong> Use the same username to access your predictions from any device
            </p>
          </div>

          {/* Flags decoration */}
          <div className="mt-8 flex items-center justify-center gap-3 text-3xl">
            <span>🇺🇸</span>
            <span>🇲🇽</span>
            <span>🇨🇦</span>
          </div>
        </motion.div>
      </main>
    </div>
  );
};

export default Auth;
