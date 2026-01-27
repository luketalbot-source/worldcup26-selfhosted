import { motion } from 'framer-motion';
import { Calendar, Swords } from 'lucide-react';

interface StageSelectorProps {
  activeStage: 'groups' | 'knockout';
  onStageChange: (stage: 'groups' | 'knockout') => void;
}

export const StageSelector = ({ activeStage, onStageChange }: StageSelectorProps) => {
  return (
    <div className="flex gap-2 p-1 bg-muted rounded-xl">
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
        Groups
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
        Knockout
      </motion.button>
    </div>
  );
};
