import { motion } from 'framer-motion';
import { Calendar } from 'lucide-react';
import { Match } from '@/types/match';
import { MatchCard } from './MatchCard';
import { Prediction } from '@/types/match';

interface TodayMatchesProps {
  matches: Match[];
  predictions: Record<string, Prediction>;
  onPredict: (matchId: string, homeScore: number, awayScore: number) => void;
  disabled?: boolean;
}

export const TodayMatches = ({ matches, predictions, onPredict, disabled }: TodayMatchesProps) => {
  if (matches.length === 0) {
    return null;
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-3"
    >
      <div className="flex items-center gap-2 px-1">
        <div className="flex items-center gap-2 bg-fifa-gold/20 text-fifa-gold px-3 py-1.5 rounded-full">
          <Calendar className="w-4 h-4" />
          <span className="text-sm font-bold">Today's Matches</span>
        </div>
        <span className="text-xs text-muted-foreground">
          {matches.length} match{matches.length !== 1 ? 'es' : ''}
        </span>
      </div>
      
      <div className="space-y-4">
        {matches.map((match) => (
          <motion.div
            key={match.id}
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            className="ring-2 ring-fifa-gold/30 rounded-2xl"
          >
            <MatchCard
              match={match}
              prediction={predictions[match.id]}
              onPredict={onPredict}
              disabled={disabled}
            />
          </motion.div>
        ))}
      </div>
    </motion.div>
  );
};
