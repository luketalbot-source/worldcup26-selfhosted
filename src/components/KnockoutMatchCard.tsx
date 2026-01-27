import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { KnockoutMatch } from '@/data/knockoutMatches';
import { Prediction } from '@/types/match';
import { ScoreSelector } from './ScoreSelector';
import { MapPin, Clock, Check, Lock, Trophy } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface KnockoutMatchCardProps {
  match: KnockoutMatch;
  prediction?: Prediction;
  onPredict: (matchId: string, homeScore: number, awayScore: number) => void;
  disabled?: boolean;
  isHighlighted?: boolean;
}

const stageLabels: Record<string, string> = {
  round16: 'Round of 16',
  quarter: 'Quarter Final',
  semi: 'Semi Final',
  third: '3rd Place',
  final: 'Final',
};

export const KnockoutMatchCard = ({ 
  match, 
  prediction, 
  onPredict, 
  disabled = false,
  isHighlighted = false 
}: KnockoutMatchCardProps) => {
  const [homeScore, setHomeScore] = useState(prediction?.homeScore ?? 0);
  const [awayScore, setAwayScore] = useState(prediction?.awayScore ?? 0);
  const [hasEdited, setHasEdited] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (prediction) {
      setHomeScore(prediction.homeScore);
      setAwayScore(prediction.awayScore);
    }
  }, [prediction]);

  const handleScoreChange = (team: 'home' | 'away', score: number) => {
    if (disabled) return;
    setHasEdited(true);
    if (team === 'home') {
      setHomeScore(score);
    } else {
      setAwayScore(score);
    }
  };

  const handleSave = async () => {
    if (disabled) return;
    setIsSaving(true);
    await onPredict(match.id, homeScore, awayScore);
    setHasEdited(false);
    setIsSaving(false);
    toast({ 
      title: 'Prediction saved!', 
      description: `${match.homeTeam.name} ${homeScore} - ${awayScore} ${match.awayTeam.name}` 
    });
  };

  const isFinished = match.status === 'finished';
  const isPredicted = !!prediction;
  const isTBD = match.homeTeam.code === 'TBD' || match.awayTeam.code === 'TBD';

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className={`relative overflow-hidden rounded-2xl shadow-card border ${
        isHighlighted 
          ? 'bg-gradient-to-br from-fifa-gold/10 to-fifa-coral/10 border-fifa-gold/30' 
          : 'bg-card border-border/50'
      } ${disabled ? 'opacity-80' : ''}`}
    >
      {/* Match Name Badge */}
      <div className="absolute top-3 left-3 flex items-center gap-2">
        <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-muted text-muted-foreground">
          {match.bracketPosition}
        </span>
        <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
          match.stage === 'final' 
            ? 'bg-fifa-gold/20 text-fifa-gold' 
            : 'bg-fifa-coral/10 text-fifa-coral'
        }`}>
          {match.stage === 'final' && <Trophy className="w-3 h-3 inline mr-1" />}
          {stageLabels[match.stage]}
        </span>
      </div>

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
            <div className="font-semibold text-foreground text-sm">
              {isTBD ? (
                <span className="text-muted-foreground text-xs">{match.homeTeam.name}</span>
              ) : (
                match.homeTeam.code
              )}
            </div>
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
                  disabled={disabled}
                />
                <span className="text-lg text-muted-foreground font-medium">:</span>
                <ScoreSelector 
                  value={awayScore} 
                  onChange={(v) => handleScoreChange('away', v)}
                  disabled={disabled}
                />
              </div>
            )}
          </div>

          {/* Away Team */}
          <div className="flex-1 text-center">
            <div className="text-4xl mb-2">{match.awayTeam.flag}</div>
            <div className="font-semibold text-foreground text-sm">
              {isTBD ? (
                <span className="text-muted-foreground text-xs">{match.awayTeam.name}</span>
              ) : (
                match.awayTeam.code
              )}
            </div>
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
            {disabled ? (
              <div className="flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-muted text-muted-foreground text-sm">
                <Lock className="w-4 h-4" />
                Log in to save predictions
              </div>
            ) : isPredicted && !hasEdited ? (
              <div className="flex items-center justify-center gap-2 py-2 px-4 rounded-lg bg-primary/10 text-primary text-sm font-medium">
                <Check className="w-4 h-4" />
                Predicted: {prediction.homeScore} - {prediction.awayScore}
              </div>
            ) : (
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={handleSave}
                disabled={isSaving || (!hasEdited && !isPredicted)}
                className={`w-full py-3 px-4 rounded-xl font-semibold text-sm transition-all ${
                  hasEdited
                    ? 'bg-accent text-accent-foreground shadow-md'
                    : 'bg-muted text-muted-foreground'
                }`}
              >
                {isSaving ? 'Saving...' : (isPredicted ? 'Update Prediction' : 'Save Prediction')}
              </motion.button>
            )}
          </div>
        )}
      </div>
    </motion.div>
  );
};
