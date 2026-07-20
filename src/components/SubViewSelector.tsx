import { motion } from 'framer-motion';
import { Calendar, Clock, ListOrdered, Swords, Table2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { SubView } from '@/lib/competitionFormats';

// Format-profile-driven sibling of StageSelector: the same pill container,
// but the buttons come from the active competition's profile instead of
// being hardcoded to today/groups/knockout. Tournament format keeps using
// StageSelector unchanged (archive safety); league/hybrid views use this.

const SUB_VIEW_META: Record<SubView, { labelKey: string; icon: typeof Clock; activeClass: string }> = {
  today: { labelKey: 'stage.today', icon: Clock, activeClass: 'bg-accent text-accent-foreground shadow-md' },
  matchday: { labelKey: 'matchday.tab', icon: Calendar, activeClass: 'bg-primary text-primary-foreground shadow-md' },
  table: { labelKey: 'standings.tab', icon: Table2, activeClass: 'bg-primary text-primary-foreground shadow-md' },
  groups: { labelKey: 'stage.groups', icon: ListOrdered, activeClass: 'bg-primary text-primary-foreground shadow-md' },
  knockout: { labelKey: 'stage.knockout', icon: Swords, activeClass: 'bg-fifa-coral text-white shadow-md' },
};

interface SubViewSelectorProps {
  subViews: SubView[];
  active: SubView;
  onChange: (view: SubView) => void;
  todayCount?: number;
}

export const SubViewSelector = ({ subViews, active, onChange, todayCount = 0 }: SubViewSelectorProps) => {
  const { t } = useTranslation();

  return (
    // Same concentric-corner rule as StageSelector: outer 20px = inner
    // rounded-lg (16px) + p-1 (4px).
    <div className="flex gap-2 p-1 bg-muted rounded-[20px]">
      {subViews.map((view) => {
        const meta = SUB_VIEW_META[view];
        const Icon = meta.icon;
        const isActive = view === active;
        return (
          <motion.button
            key={view}
            whileTap={{ scale: 0.95 }}
            onClick={() => onChange(view)}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-2 rounded-lg font-semibold text-sm transition-all ${
              isActive ? meta.activeClass : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Icon className="w-4 h-4" />
            <span className="truncate">{t(meta.labelKey)}</span>
            {view === 'today' && todayCount > 0 && (
              <span className="ml-1 px-1.5 py-0.5 text-xs rounded-full bg-background/50">
                {todayCount}
              </span>
            )}
          </motion.button>
        );
      })}
    </div>
  );
};
