import { motion } from 'framer-motion';
import { Archive } from 'lucide-react';
import { useCompetitions } from '@/contexts/CompetitionContext';

// Competition pill bar — rendered above the view content on competition-
// scoped tabs (matches / boost / stats; Leagues and Profile are cross-
// competition). Hidden entirely when the tenant has exactly one enabled
// competition, so single-competition tenants keep the pre-multi-comp look.
//
// Archived competitions (is_active=false) render last with an archive icon
// and muted treatment — still tappable; the archive is just another
// competition whose matches have all finished.
export const CompetitionSwitcher = () => {
  const { competitions, activeCompetition, setActiveCompetition } = useCompetitions();

  if (competitions.length <= 1) return null;

  const ordered = [
    ...competitions.filter((c) => c.is_active),
    ...competitions.filter((c) => !c.is_active),
  ];

  return (
    // Same concentric-corner rule as StageSelector: outer 20px = inner
    // rounded-lg (16px) + p-1 (4px). Scrolls horizontally when a tenant
    // has many competitions enabled.
    <div className="flex gap-2 p-1 bg-muted rounded-[20px] overflow-x-auto scrollbar-hide">
      {ordered.map((comp) => {
        const isActive = comp.id === activeCompetition?.id;
        return (
          <motion.button
            key={comp.id}
            whileTap={{ scale: 0.95 }}
            onClick={() => setActiveCompetition(comp.id)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg font-semibold text-sm whitespace-nowrap transition-all ${
              isActive
                ? 'bg-primary text-primary-foreground shadow-md'
                : comp.is_active
                  ? 'text-muted-foreground hover:text-foreground'
                  : 'text-muted-foreground/60 hover:text-muted-foreground'
            }`}
          >
            {!comp.is_active && <Archive className="w-3.5 h-3.5" />}
            {comp.short_name}
          </motion.button>
        );
      })}
    </div>
  );
};
