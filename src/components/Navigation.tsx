import { motion } from 'framer-motion';
import { Calendar, Users, User, Rocket } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useTenant } from '@/contexts/TenantContext';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';

interface NavigationProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
}

export const Navigation = ({ activeTab, onTabChange }: NavigationProps) => {
  const { t } = useTranslation();
  const { tenant } = useTenant();
  const [termsOpen, setTermsOpen] = useState(false);

  // Trim before deciding visibility — a whitespace-only ToU shouldn't
  // produce a clickable link with empty contents.
  const termsOfUse = tenant?.terms_of_use?.trim() ?? '';
  const hasTerms = termsOfUse.length > 0;

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
            tap targets around. Translated per locale; copy lives in nav.disclaimer.
            When the current tenant has a Terms-of-Use set, a "Terms" link
            appears inline (separated by a bullet) — opens a modal with the
            full text. Hidden entirely when ToU is empty so default tenants
            stay clean. */}
        <p className="text-[9px] leading-tight text-muted-foreground/70 text-center px-2 pb-1 select-none">
          {t('nav.disclaimer')}
          {hasTerms && (
            <>
              {' · '}
              <button
                type="button"
                onClick={() => setTermsOpen(true)}
                className="underline underline-offset-2 hover:text-foreground select-none"
              >
                {t('nav.terms')}
              </button>
            </>
          )}
        </p>
      </div>

      {hasTerms && (
        <Dialog open={termsOpen} onOpenChange={setTermsOpen}>
          <DialogContent className="sm:max-w-md max-h-[80vh] p-0 gap-0 flex flex-col">
            <DialogHeader className="p-4 border-b shrink-0">
              <DialogTitle>{t('nav.terms')}</DialogTitle>
            </DialogHeader>
            <ScrollArea className="flex-1 min-h-0">
              {/* whitespace-pre-wrap preserves the admin's line breaks
                  without forcing them to write HTML/Markdown — most
                  pasted legal copy already has its own paragraph breaks. */}
              <div className="px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap break-words">
                {termsOfUse}
              </div>
            </ScrollArea>
          </DialogContent>
        </Dialog>
      )}
    </nav>
  );
};
