import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Match, Prediction } from '@/types/match';
import { ScoreSelector } from './ScoreSelector';
import { MapPin, Clock, Check, Lock } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { getFlagUrl } from '@/lib/flagUtils';

interface MatchCardProps {
  match: Match;
  prediction?: Prediction;
  onPredict: (matchId: string, homeScore: number, awayScore: number) => void;
  disabled?: boolean;
}

export const MatchCard = ({ match, prediction, onPredict, disabled = false }: MatchCardProps) => {
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
    toast({ title: 'Prediction saved!', description: `${match.homeTeam.code} ${homeScore} - ${awayScore} ${match.awayTeam.code}` });
  };

  const isFinished = match.status === 'finished';
  const isPredicted = !!prediction;
  const isCorrect = isFinished && prediction && 
    prediction.homeScore === match.homeScore && 
    prediction.awayScore === match.awayScore;

  const homeFlagUrl = getFlagUrl(match.homeTeam.code);
  const awayFlagUrl = getFlagUrl(match.awayTeam.code);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className={`relative overflow-hidden rounded-2xl shadow-card border h-[250px] ${
        isCorrect ? 'ring-2 ring-fifa-green border-fifa-green/50' : 'border-border/50'
      } ${disabled ? 'opacity-80' : ''}`}
    >
      {/* Background Flags Container */}
      <div className="absolute inset-0 flex">
        {/* Home Team Flag - Left Side */}
        <div className="relative w-1/2 h-full overflow-hidden">
          {homeFlagUrl ? (
            <>
              <img 
                src={homeFlagUrl} 
                alt={match.homeTeam.name}
                className="absolute inset-0 w-full h-full object-cover object-center opacity-60"
              />
              <div className="absolute inset-0 bg-gradient-to-r from-transparent from-40% to-white to-100%" />
              <div className="absolute inset-0 bg-black/20" />
            </>
          ) : (
            <div className="absolute inset-0 bg-gradient-to-r from-muted to-white flex items-center justify-center">
              <span className="text-4xl opacity-30">{match.homeTeam.flag}</span>
            </div>
          )}
        </div>
        
        {/* Away Team Flag - Right Side */}
        <div className="relative w-1/2 h-full overflow-hidden">
          {awayFlagUrl ? (
            <>
              <img 
                src={awayFlagUrl} 
                alt={match.awayTeam.name}
                className="absolute inset-0 w-full h-full object-cover object-center opacity-60"
              />
              <div className="absolute inset-0 bg-gradient-to-l from-transparent from-40% to-white to-100%" />
              <div className="absolute inset-0 bg-black/20" />
            </>
          ) : (
            <div className="absolute inset-0 bg-gradient-to-l from-muted to-white flex items-center justify-center">
              <span className="text-4xl opacity-30">{match.awayTeam.flag}</span>
            </div>
          )}
        </div>
      </div>

      {/* Content Overlay */}
      <div className="relative z-10 p-4 h-full flex flex-col gap-4">
        {/* Top Row - All Badges */}
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-2 flex-wrap">
            {match.group && (
              <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-black/60 text-white backdrop-blur-sm">
                Group {match.group}
              </span>
            )}
            <div className="flex items-center gap-1 bg-black/40 px-2 py-0.5 rounded-full backdrop-blur-sm text-white text-xs">
              <Clock className="w-3 h-3" />
              <span>{match.date}</span>
            </div>
            <div className="flex items-center gap-1 bg-black/40 px-2 py-0.5 rounded-full backdrop-blur-sm text-white text-xs">
              <MapPin className="w-3 h-3" />
              <span>{match.city}</span>
            </div>
          </div>
          
          <div className={`px-2 py-0.5 rounded-full text-xs font-semibold backdrop-blur-sm ${
            match.status === 'live' 
              ? 'bg-destructive text-white animate-pulse' 
              : match.status === 'finished'
                ? 'bg-black/60 text-white'
                : 'bg-primary/80 text-white'
          }`}>
            {match.status === 'live' ? 'LIVE' : match.status === 'finished' ? 'FT' : match.time}
          </div>
        </div>

        {/* Score Section - Center with Team Names beside scores */}
        <div className="flex-1 flex items-center justify-center">
          <div className="bg-white/30 backdrop-blur-sm rounded-xl px-4 py-2 shadow-lg">
            {isFinished ? (
              <div className="flex items-center gap-3">
                <span className="text-sm font-semibold text-foreground truncate max-w-[80px]">{match.homeTeam.name}</span>
                <div className="text-2xl font-bold text-foreground">{match.homeScore}</div>
                <div className="text-lg text-muted-foreground font-light">-</div>
                <div className="text-2xl font-bold text-foreground">{match.awayScore}</div>
                <span className="text-sm font-semibold text-foreground truncate max-w-[80px]">{match.awayTeam.name}</span>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-foreground truncate max-w-[70px]">{match.homeTeam.name}</span>
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
                <span className="text-sm font-semibold text-foreground truncate max-w-[70px]">{match.awayTeam.name}</span>
              </div>
            )}
          </div>
        </div>

        {/* Prediction Section */}
        {!isFinished && (
          <div>
            {disabled ? (
              <div className="flex items-center justify-center gap-2 py-2 px-3 rounded-lg bg-white/90 text-muted-foreground text-xs backdrop-blur-sm">
                <Lock className="w-3 h-3" />
                Log in to save
              </div>
            ) : isPredicted && !hasEdited ? (
              <div className="flex items-center justify-center gap-2 py-1.5 px-3 rounded-lg bg-primary/90 text-white text-xs font-medium backdrop-blur-sm">
                <Check className="w-3 h-3" />
                Predicted: {prediction.homeScore} - {prediction.awayScore}
              </div>
            ) : (
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={handleSave}
                disabled={isSaving || (!hasEdited && !isPredicted)}
                className={`w-full py-2 px-3 rounded-lg font-semibold text-xs transition-all backdrop-blur-sm ${
                  hasEdited
                    ? 'bg-accent text-accent-foreground shadow-md'
                    : 'bg-white/90 text-muted-foreground'
                }`}
              >
                {isSaving ? 'Saving...' : (isPredicted ? 'Update' : 'Save Prediction')}
              </motion.button>
            )}
          </div>
        )}

        {/* Result comparison for finished matches */}
        {isFinished && prediction && (
          <div className={`py-1.5 px-3 rounded-lg text-xs font-medium text-center backdrop-blur-sm ${
            isCorrect 
              ? 'bg-fifa-green/90 text-white' 
              : 'bg-white/90 text-muted-foreground'
          }`}>
            Your prediction: {prediction.homeScore} - {prediction.awayScore}
            {isCorrect && ' ✓'}
          </div>
        )}
      </div>
    </motion.div>
  );
};
