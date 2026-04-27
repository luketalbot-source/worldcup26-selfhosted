import { motion } from 'framer-motion';
import { Calendar, Users, User, Rocket } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface NavigationProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
}

export const Navigation = ({ activeTab, onTabChange }: NavigationProps) => {
  const { t } = useTranslation();
  
  const tabs = [
    { id: 'matches', labelKey: 'nav.matches', icon: Calendar },
    { id: 'boost', labelKey: 'nav.boost', icon: Rocket },
    { id: 'leagues', labelKey: 'nav.leagues', icon: Users },
    { id: 'profile', labelKey: 'nav.me', icon: User },
  ];

  return (
    // In dark mode the bottom nav is pure black to match the Flip host's
    // sidebar — the embedded app should feel like part of the chrome, not
    // a separate slate-toned panel. Light mode keeps `bg-card`.
    <nav className="fixed bottom-0 left-0 right-0 bg-card dark:bg-black border-t border-border dark:border-black z-50 safe-area-inset-bottom">
      <span
        className="absolute -top-2.5 left-1/2 -translate-x-1/2 bg-amber-500 text-white text-[10px] font-bold tracking-wider px-2 py-0.5 rounded-full shadow-sm pointer-events-none"
        aria-label="Beta environment"
      >
        BETA
      </span>
      <div className="max-w-[700px] mx-auto px-4">
        <div className="flex items-center justify-around py-2">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            
            return (
              <motion.button
                key={tab.id}
                whileTap={{ scale: 0.9 }}
                onClick={() => onTabChange(tab.id)}
                className={`flex flex-col items-center gap-1 py-2 px-4 rounded-xl transition-colors ${
                  isActive ? 'text-primary' : 'text-muted-foreground'
                }`}
              >
                <Icon className="w-6 h-6" />
                <span className="text-xs font-medium">{t(tab.labelKey)}</span>
              </motion.button>
            );
          })}
        </div>
      </div>
    </nav>
  );
};
