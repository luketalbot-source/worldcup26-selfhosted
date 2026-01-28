import { motion } from 'framer-motion';
import { Calendar, Swords, Clock } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface StageSelectorProps {
  activeStage: 'today' | 'groups' | 'knockout';
  onStageChange: (stage: 'today' | 'groups' | 'knockout') => void;
  todayCount?: number;
}

export const StageSelector = ({ activeStage, onStageChange, todayCount = 0 }: StageSelectorProps) => {
  const { t } = useTranslation();
  
  return (
    <div className="flex gap-2 p-1 bg-muted rounded-xl">
      <motion.button
        whileTap={{ scale: 0.95 }}
        onClick={() => onStageChange('today')}
        className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg font-semibold text-sm transition-all ${
          activeStage === 'today'
            ? 'bg-accent text-accent-foreground shadow-md'
            : 'text-muted-foreground hover:text-foreground'
        }`}
      >
        <Clock className="w-4 h-4" />
        {t('stage.today')}
        {todayCount > 0 && (
          <span className="ml-1 px-1.5 py-0.5 text-xs rounded-full bg-background/50">
            {todayCount}
          </span>
        )}
      </motion.button>
      <motion.button
        whileTap={{ scale: 0.95 }}
        onClick={() => onStageChange('groups')}
        className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg font-semibold text-sm transition-all ${
          activeStage === 'groups'
            ? 'bg-primary text-primary-foreground shadow-md'
            : 'text-muted-foreground hover:text-foreground'
        }`}
      >
        <Calendar className="w-4 h-4" />
        {t('stage.groups')}
      </motion.button>
      <motion.button
        whileTap={{ scale: 0.95 }}
        onClick={() => onStageChange('knockout')}
        className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg font-semibold text-sm transition-all ${
          activeStage === 'knockout'
            ? 'bg-fifa-coral text-white shadow-md'
            : 'text-muted-foreground hover:text-foreground'
        }`}
      >
        <Swords className="w-4 h-4" />
        {t('stage.knockout')}
      </motion.button>
    </div>
  );
};
