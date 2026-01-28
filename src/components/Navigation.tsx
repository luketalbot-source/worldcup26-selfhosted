import { motion } from 'framer-motion';
import { Calendar, Trophy, BarChart3, Users } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface NavigationProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
}

export const Navigation = ({ activeTab, onTabChange }: NavigationProps) => {
  const { t } = useTranslation();
  
  const tabs = [
    { id: 'matches', labelKey: 'nav.matches', icon: Calendar },
    { id: 'standings', labelKey: 'nav.standings', icon: BarChart3 },
    { id: 'leagues', labelKey: 'nav.leagues', icon: Users },
    { id: 'leaderboard', labelKey: 'nav.leaders', icon: Trophy },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-card border-t border-border z-50 safe-area-inset-bottom">
      <div className="container">
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
