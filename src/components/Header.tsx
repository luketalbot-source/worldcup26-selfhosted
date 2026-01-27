import { motion } from 'framer-motion';
import { LogIn } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useProfile } from '@/hooks/useProfile';
import { useNavigate } from 'react-router-dom';
import wc2026Logo from '@/assets/wc2026-logo.png';

export const Header = () => {
  const { user, signOut } = useAuth();
  const { profile } = useProfile(user?.id);
  const navigate = useNavigate();

  return (
    <header className="text-foreground sticky top-0 z-50 bg-background">
      <div className="container pt-2 pb-2">
        <motion.div 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center justify-between relative"
        >
          <div className="w-20" /> {/* Spacer for balance */}
          
          <div className="absolute left-1/2 -translate-x-1/2">
            <img 
              src={wc2026Logo} 
              alt="FIFA World Cup 2026" 
              className="h-14 w-auto"
            />
          </div>
          
          {user ? (
            <button
              onClick={() => navigate('/', { state: { tab: 'profile' } })}
              className="flex items-center gap-2 px-2 py-1 rounded-lg hover:bg-white/10 transition-colors"
            >
              <span className="text-sm font-medium hidden sm:block">{profile?.displayName || 'User'}</span>
              <span className="text-2xl">{profile?.avatarEmoji || '👤'}</span>
            </button>
          ) : (
            <button
              onClick={() => navigate('/auth')}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 transition-colors text-sm font-medium"
            >
              <LogIn className="w-4 h-4" />
              <span className="hidden sm:inline">Log In</span>
            </button>
          )}
        </motion.div>
      </div>
    </header>
  );
};
