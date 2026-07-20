import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, Info } from 'lucide-react';
import { useTranslation } from 'react-i18next';

// Collapsible explainer of how the league ranking breaks ties. Shown above the
// standings so players can self-serve on "why am I ranked here?" instead of
// asking support. Copy mirrors the 5-stage tiebreak in routes/leaderboard.ts.
export const TiebreakInfo = () => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  const steps = [
    t('leaderboard.tiebreak1'),
    t('leaderboard.tiebreak2'),
    t('leaderboard.tiebreak3'),
    t('leaderboard.tiebreak4'),
  ];

  return (
    <div className="mb-3 rounded-xl border border-border/60 bg-muted/30 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full flex items-center gap-2 px-3 py-2.5 text-sm font-medium text-foreground text-left"
      >
        <Info className="w-4 h-4 text-primary flex-shrink-0" />
        <span className="flex-1">{t('leaderboard.tiebreakTitle')}</span>
        <ChevronDown className={`w-4 h-4 flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <div className="px-3 pb-3 text-xs text-muted-foreground space-y-2">
              <p>{t('leaderboard.tiebreakIntro')}</p>
              <ol className="list-decimal list-inside space-y-1">
                {steps.map((step, i) => (
                  <li key={i}>{step}</li>
                ))}
              </ol>
              <p className="italic pt-0.5">{t('leaderboard.tiebreakShared')}</p>
              <p className="pt-0.5">{t('leaderboard.tiebreakScope')}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
