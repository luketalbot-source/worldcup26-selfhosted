import { motion } from 'framer-motion';
import { ArrowLeftRight, LayoutGrid } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useCompetitions } from '@/contexts/CompetitionContext';

// Slim "which game am I in?" bar for multi-competition tenants: shows the
// active game and returns to the game hub on tap. Replaces the old
// full-width pill switcher (which didn't scale past three competitions).
// Hidden entirely for single-competition tenants.
//
// Width is capped to match the page content (max-w-[700px], centered) so it
// lines up with the tab bar and cards below it instead of spanning the whole
// container. onSwitchGame is REQUIRED (not just clearActiveCompetition): the
// shell resets the tab AND clears the competition so "Switch game" reaches the
// hub even from a non-competition-scoped tab like Leagues. A bare clear would
// leave a non-scoped tab with no active competition and no hub — a dead-end.
export const CompetitionSwitchChip = ({ onSwitchGame }: { onSwitchGame: () => void }) => {
  const { t } = useTranslation();
  const { competitions, activeCompetition } = useCompetitions();

  if (competitions.length <= 1 || !activeCompetition) return null;

  return (
    <motion.button
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      whileTap={{ scale: 0.97 }}
      onClick={onSwitchGame}
      className="w-full max-w-[700px] mx-auto flex items-center gap-2.5 px-3.5 py-2 rounded-xl bg-card border border-border/50 shadow-card hover:bg-muted transition-colors"
    >
      <LayoutGrid className="w-4 h-4 text-muted-foreground shrink-0" />
      <span className="flex-1 min-w-0 text-left">
        <span className="text-sm font-bold text-foreground truncate">
          {activeCompetition.short_name}
        </span>
        <span className="text-xs text-muted-foreground ml-2">{activeCompetition.season}</span>
      </span>
      <span className="flex items-center gap-1.5 text-xs font-semibold text-primary shrink-0">
        <ArrowLeftRight className="w-3.5 h-3.5" />
        {t('competitions.switchGame')}
      </span>
    </motion.button>
  );
};
