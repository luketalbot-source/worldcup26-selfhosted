import { motion } from 'framer-motion';
import { LogIn } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/contexts/AuthContext';
import { useProfile } from '@/hooks/useProfile';
import { useNavigate } from 'react-router-dom';
import { LanguageSelector } from './LanguageSelector';
import { ThemeToggle } from './ThemeToggle';
import wc2026Logo from '@/assets/wc2026-logo.png';

interface HeaderProps {
  hideUserSection?: boolean;
}

export const Header = ({ hideUserSection = false }: HeaderProps) => {
  const { t } = useTranslation();
  const { user, signOut } = useAuth();
  const { profile } = useProfile(user?.id);
  const navigate = useNavigate();

  return (
    <header className="text-foreground sticky top-0 z-50 bg-background">
      <div className="container py-4">
        <motion.div 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center justify-between"
        >
          <div className="flex items-center gap-1">
            <LanguageSelector />
            <ThemeToggle />
          </div>
          
          <div className="flex-shrink-0">
            <img 
              src={wc2026Logo} 
              alt="FIFA World Cup 2026" 
              className="h-12 w-auto object-contain"
            />
          </div>
          
          {!hideUserSection && (
            user ? (
              <button
                onClick={() => navigate('/', { state: { tab: 'profile' } })}
                className="flex items-center gap-2 px-2 py-1 rounded-lg hover:bg-muted transition-colors"
              >
                <span className="text-sm font-medium hidden sm:block">{profile?.displayName || t('header.user')}</span>
                <span className="text-2xl">{profile?.avatarEmoji || '👤'}</span>
              </button>
            ) : (
              <button
                onClick={() => navigate('/auth')}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-muted hover:bg-muted/80 transition-colors text-sm font-medium"
              >
                <LogIn className="w-4 h-4" />
                <span className="hidden sm:inline">{t('header.login')}</span>
              </button>
            )
          )}
          {hideUserSection && <div className="w-20" />}
        </motion.div>
      </div>
    </header>
  );
};
