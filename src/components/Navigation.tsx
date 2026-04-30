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
    // Dark-mode background tracks Flip's sidebar token (--s-translucent-low-default
    // → rgba(43, 43, 43, 0.8)) so the embedded app blends with the host
    // chrome. Light mode keeps `bg-card`.
    <nav className="fixed bottom-0 left-0 right-0 bg-card dark:bg-[rgba(43,43,43,0.8)] backdrop-blur-md border-t border-border dark:border-[rgba(255,255,255,0.06)] z-50 safe-area-inset-bottom">
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
        {/* Trademark disclaimer. Tiny by design — visible but unobtrusive,
            sized so it fits on a single line at the narrowest mobile widths
            (~320px) without wrapping. Under the menu so it doesn't push the
            tap targets around. Translated per locale; copy lives in nav.disclaimer. */}
        <p
          className="text-[9px] leading-tight text-muted-foreground/70 text-center px-2 pb-1 select-none"
        >
          {t('nav.disclaimer')}
        </p>
      </div>
    </nav>
  );
};
