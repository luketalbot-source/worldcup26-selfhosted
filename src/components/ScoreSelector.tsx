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

  // +/- buttons match the score's footprint (w-12 h-12 rounded-xl) and
  // colour (bg-primary) so they read as a single tap-target stack rather
  // than the previous tiny low-contrast circles. On mobile the bigger
  // surface also doubles as a forgiveness margin for thumb taps.
  const buttonClass = (active: boolean) =>
    `w-12 h-12 rounded-xl flex items-center justify-center transition-colors shadow-md ${
      disabled || !active
        ? 'bg-muted text-muted-foreground cursor-not-allowed'
        : 'bg-primary text-primary-foreground hover:bg-primary/90'
    }`;

  return (
    <div className="flex flex-col items-center gap-1.5">
      <motion.button
        whileHover={disabled || value >= max ? {} : { scale: 1.05 }}
        whileTap={disabled || value >= max ? {} : { scale: 0.92 }}
        onClick={increment}
        disabled={disabled || value >= max}
        aria-label="Increase score"
        className={buttonClass(value < max)}
      >
        <Plus className="w-6 h-6" strokeWidth={2.5} />
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
        whileHover={disabled || value <= min ? {} : { scale: 1.05 }}
        whileTap={disabled || value <= min ? {} : { scale: 0.92 }}
        onClick={decrement}
        disabled={disabled || value <= min}
        aria-label="Decrease score"
        className={buttonClass(value > min)}
      >
        <Minus className="w-6 h-6" strokeWidth={2.5} />
      </motion.button>
    </div>
  );
};
