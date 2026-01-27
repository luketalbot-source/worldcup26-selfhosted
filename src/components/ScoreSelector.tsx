import { motion } from 'framer-motion';
import { Minus, Plus } from 'lucide-react';

interface ScoreSelectorProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  disabled?: boolean;
}

export const ScoreSelector = ({ value, onChange, min = 0, max = 15, disabled = false }: ScoreSelectorProps) => {
  const increment = () => {
    if (!disabled && value < max) onChange(value + 1);
  };

  const decrement = () => {
    if (!disabled && value > min) onChange(value - 1);
  };

  return (
    <div className="flex flex-col items-center gap-1">
      <motion.button
        whileHover={disabled ? {} : { scale: 1.1 }}
        whileTap={disabled ? {} : { scale: 0.9 }}
        onClick={increment}
        disabled={disabled}
        className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${
          disabled 
            ? 'bg-muted text-muted-foreground cursor-not-allowed' 
            : 'bg-primary/10 text-primary hover:bg-primary/20'
        }`}
      >
        <Plus className="w-4 h-4" />
      </motion.button>
      
      <motion.div 
        key={value}
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className={`w-12 h-12 rounded-xl flex items-center justify-center text-2xl font-bold shadow-md ${
          disabled 
            ? 'bg-muted text-muted-foreground' 
            : 'bg-primary text-primary-foreground'
        }`}
      >
        {value}
      </motion.div>
      
      <motion.button
        whileHover={disabled ? {} : { scale: 1.1 }}
        whileTap={disabled ? {} : { scale: 0.9 }}
        onClick={decrement}
        disabled={disabled}
        className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${
          disabled 
            ? 'bg-muted text-muted-foreground cursor-not-allowed' 
            : 'bg-primary/10 text-primary hover:bg-primary/20'
        }`}
      >
        <Minus className="w-4 h-4" />
      </motion.button>
    </div>
  );
};
