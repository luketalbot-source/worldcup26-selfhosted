import { useState } from 'react';
import { motion } from 'framer-motion';
import { Match, Prediction } from '@/types/match';
import { ScoreSelector } from './ScoreSelector';
import { MapPin, Clock, Check } from 'lucide-react';

interface MatchCardProps {
  match: Match;
  prediction?: Prediction;
  onPredict: (matchId: string, homeScore: number, awayScore: number) => void;
}

export const MatchCard = ({ match, prediction, onPredict }: MatchCardProps) => {
  const [homeScore, setHomeScore] = useState(prediction?.homeScore ?? 0);
  const [awayScore, setAwayScore] = useState(prediction?.awayScore ?? 0);
  const [hasEdited, setHasEdited] = useState(false);

  const handleScoreChange = (team: 'home' | 'away', score: number) => {
    setHasEdited(true);
    if (team === 'home') {
      setHomeScore(score);
    } else {
      setAwayScore(score);
    }
  };

  const handleSave = () => {
    onPredict(match.id, homeScore, awayScore);
    setHasEdited(false);
  };

  const isFinished = match.status === 'finished';
  const isPredicted = !!prediction;
  const isCorrect = isFinished && prediction && 
    prediction.homeScore === match.homeScore && 
    prediction.awayScore === match.awayScore;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className={`relative overflow-hidden rounded-2xl bg-card shadow-card border border-border/50 ${
        isCorrect ? 'ring-2 ring-fifa-green' : ''
      }`}
    >
      {/* Group Badge */}
      {match.group && (
        <div className="absolute top-3 left-3 px-2 py-0.5 rounded-full bg-primary/10 text-primary text-xs font-semibold">
          Group {match.group}
        </div>
      )}

      {/* Status Badge */}
      <div className={`absolute top-3 right-3 px-2 py-0.5 rounded-full text-xs font-semibold ${
        match.status === 'live' 
          ? 'bg-destructive/10 text-destructive animate-pulse-glow' 
          : match.status === 'finished'
            ? 'bg-muted text-muted-foreground'
            : 'bg-primary/10 text-primary'
      }`}>
        {match.status === 'live' ? 'LIVE' : match.status === 'finished' ? 'FT' : 'Upcoming'}
      </div>

      <div className="pt-10 pb-4 px-4">
        {/* Teams and Scores */}
        <div className="flex items-center justify-between gap-2">
          {/* Home Team */}
          <div className="flex-1 text-center">
            <div className="text-4xl mb-2">{match.homeTeam.flag}</div>
            <div className="font-semibold text-foreground text-sm">{match.homeTeam.code}</div>
          </div>

          {/* Score Section */}
          <div className="flex-shrink-0">
            {isFinished ? (
              <div className="flex items-center gap-3">
                <div className="text-3xl font-bold text-foreground">{match.homeScore}</div>
                <div className="text-xl text-muted-foreground">-</div>
                <div className="text-3xl font-bold text-foreground">{match.awayScore}</div>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <ScoreSelector 
                  value={homeScore} 
                  onChange={(v) => handleScoreChange('home', v)} 
                />
                <span className="text-lg text-muted-foreground font-medium">:</span>
                <ScoreSelector 
                  value={awayScore} 
                  onChange={(v) => handleScoreChange('away', v)} 
                />
              </div>
            )}
          </div>

          {/* Away Team */}
          <div className="flex-1 text-center">
            <div className="text-4xl mb-2">{match.awayTeam.flag}</div>
            <div className="font-semibold text-foreground text-sm">{match.awayTeam.code}</div>
          </div>
        </div>

        {/* Match Info */}
        <div className="mt-4 flex items-center justify-center gap-4 text-xs text-muted-foreground">
          <div className="flex items-center gap-1">
            <Clock className="w-3 h-3" />
            <span>{match.date}, {match.time}</span>
          </div>
          <div className="flex items-center gap-1">
            <MapPin className="w-3 h-3" />
            <span>{match.city}</span>
          </div>
        </div>

        {/* Prediction Section */}
        {!isFinished && (
          <div className="mt-4">
            {isPredicted && !hasEdited ? (
              <div className="flex items-center justify-center gap-2 py-2 px-4 rounded-lg bg-primary/10 text-primary text-sm font-medium">
                <Check className="w-4 h-4" />
                Predicted: {prediction.homeScore} - {prediction.awayScore}
              </div>
            ) : (
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={handleSave}
                disabled={!hasEdited && !isPredicted}
                className={`w-full py-3 px-4 rounded-xl font-semibold text-sm transition-all ${
                  hasEdited
                    ? 'bg-accent text-accent-foreground shadow-md'
                    : 'bg-muted text-muted-foreground'
                }`}
              >
                {isPredicted ? 'Update Prediction' : 'Save Prediction'}
              </motion.button>
            )}
          </div>
        )}

        {/* Result comparison for finished matches */}
        {isFinished && prediction && (
          <div className={`mt-4 py-2 px-4 rounded-lg text-sm font-medium text-center ${
            isCorrect 
              ? 'bg-fifa-green/10 text-fifa-green' 
              : 'bg-muted text-muted-foreground'
          }`}>
            Your prediction: {prediction.homeScore} - {prediction.awayScore}
            {isCorrect && ' ✓ Correct!'}
          </div>
        )}
      </div>
    </motion.div>
  );
};
