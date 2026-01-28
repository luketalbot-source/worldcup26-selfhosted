import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { User } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Header } from '@/components/Header';
import { z } from 'zod';

const REMEMBERED_USERNAME_KEY = 'wc2026_remembered_username';

const Auth = () => {
  const { t } = useTranslation();
  const [username, setUsername] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const { loginWithUsername } = useAuth();
  const navigate = useNavigate();

  const usernameSchema = z.string()
    .min(2, t('auth.validation.minLength'))
    .max(20, t('auth.validation.maxLength'))
    .regex(/^[a-zA-Z0-9_]+$/, t('auth.validation.pattern'));

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
    setError('');

    try {
      // Validate username
      const usernameResult = usernameSchema.safeParse(username);
      if (!usernameResult.success) {
        setError(usernameResult.error.errors[0].message);
        setIsLoading(false);
        return;
      }

      const { error: loginError } = await loginWithUsername(username);
      
      if (loginError) {
        setError(loginError.message);
      } else {
        // Save or clear remembered username based on checkbox
        if (rememberMe) {
          localStorage.setItem(REMEMBERED_USERNAME_KEY, username);
        } else {
          localStorage.removeItem(REMEMBERED_USERNAME_KEY);
        }
        navigate('/');
      }
    } catch (err) {
      setError(t('auth.unexpectedError'));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Header hideUserSection />

      <main className="container py-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-sm mx-auto"
        >
          {/* Title */}
          <div className="text-center mb-8">
            <h2 className="text-2xl font-bold text-foreground mb-2">
              {t('auth.title')}
            </h2>
            <p className="text-muted-foreground">
              {t('auth.subtitle')}
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">{t('auth.usernameLabel')}</label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                <Input
                  type="text"
                  placeholder={t('auth.usernamePlaceholder')}
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="pl-10 h-12 rounded-xl"
                  autoComplete="username"
                  autoFocus
                />
              </div>
              <p className="text-xs text-muted-foreground">
                {t('auth.usernameHint')}
              </p>
            </div>

            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}

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
                {t('auth.rememberMe')}
              </label>
            </div>

            <Button
              type="submit"
              disabled={isLoading || !username.trim()}
              className="w-full h-12 rounded-xl bg-accent hover:bg-accent/90 text-accent-foreground font-semibold text-base"
            >
              {isLoading ? t('auth.loading') : t('auth.submit')}
            </Button>
          </form>

        </motion.div>
      </main>
    </div>
  );
};

export default Auth;
