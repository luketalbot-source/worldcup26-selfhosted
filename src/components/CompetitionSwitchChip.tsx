import { motion } from 'framer-motion';
import { ArrowLeftRight, LayoutGrid } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useCompetitions } from '@/contexts/CompetitionContext';

// Slim "which game am I in?" bar for multi-competition tenants: shows the
// active game and switches back to the game hub on tap. Replaces the old
// full-width pill switcher (which didn't scale past three competitions).
// Hidden entirely for single-competition tenants.
export const CompetitionSwitchChip = () => {
  const { t } = useTranslation();
  const { competitions, activeCompetition, clearActiveCompetition } = useCompetitions();

  if (competitions.length <= 1 || !activeCompetition) return null;

  return (
    <motion.button
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      whileTap={{ scale: 0.97 }}
      onClick={clearActiveCompetition}
      className="w-full flex items-center gap-2.5 px-3.5 py-2 rounded-xl bg-card border border-border/50 shadow-card hover:bg-muted transition-colors"
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
