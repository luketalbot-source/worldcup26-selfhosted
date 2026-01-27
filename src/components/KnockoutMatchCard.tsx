import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { KnockoutMatch } from '@/data/knockoutMatches';
import { Prediction } from '@/types/match';
import { ScoreSelector } from './ScoreSelector';
import { MapPin, Clock, Check, Lock } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { getFlagUrl } from '@/lib/flagUtils';
import { useMatchTime } from '@/hooks/useMatchTime';

interface KnockoutMatchCardProps {
  match: KnockoutMatch;
  prediction?: Prediction;
  onPredict: (matchId: string, homeScore: number, awayScore: number) => void;
  disabled?: boolean;
  isHighlighted?: boolean;
}

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

  const { localDate, localTime, isLocked, countdownText, urgency } = useMatchTime(match.date, match.time);

  // Match is locked if it's within 30 min of start, live, or finished
  const isMatchLocked = isLocked || match.status === 'live' || match.status === 'finished';
  const isFinished = match.status === 'finished';
  const isLive = match.status === 'live';
  const isPredicted = !!prediction;
  const isTBD = match.homeTeam.code === 'TBD' || match.awayTeam.code === 'TBD';

  useEffect(() => {
    if (prediction) {
      setHomeScore(prediction.homeScore);
      setAwayScore(prediction.awayScore);
    }
  }, [prediction]);

  const handleScoreChange = (team: 'home' | 'away', score: number) => {
    if (disabled || isMatchLocked) return;
    setHasEdited(true);
    if (team === 'home') {
      setHomeScore(score);
    } else {
      setAwayScore(score);
    }
  };

  const handleSave = async () => {
    if (disabled || isMatchLocked) return;
    setIsSaving(true);
    await onPredict(match.id, homeScore, awayScore);
    setHasEdited(false);
    setIsSaving(false);
    toast({ 
      title: 'Prediction saved!', 
      description: `${match.homeTeam.name} ${homeScore} - ${awayScore} ${match.awayTeam.name}` 
    });
  };

  const homeFlagUrl = getFlagUrl(match.homeTeam.code);
  const awayFlagUrl = getFlagUrl(match.awayTeam.code);

  // Determine what scores to show in the selector area
  const displayHomeScore = (isLive || isFinished) ? (match.homeScore ?? 0) : homeScore;
  const displayAwayScore = (isLive || isFinished) ? (match.awayScore ?? 0) : awayScore;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className={`relative overflow-hidden rounded-2xl shadow-card border h-[250px] ${
        isHighlighted 
          ? 'border-fifa-gold/50' 
          : 'border-border/50'
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
            <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-black/60 text-white backdrop-blur-sm">
              {match.bracketPosition}
            </span>
            <div className="flex items-center gap-1 bg-black/60 px-2 py-0.5 rounded-full backdrop-blur-sm text-white text-xs">
              <Clock className="w-3 h-3" />
              <span>{localDate} {localTime}</span>
            </div>
            <div className="flex items-center gap-1 bg-black/60 px-2 py-0.5 rounded-full backdrop-blur-sm text-white text-xs">
              <MapPin className="w-3 h-3" />
              <span>{match.city}</span>
            </div>
          </div>
          
          <div className={`px-2 py-0.5 rounded-full text-xs font-semibold backdrop-blur-sm ${
            isLive 
              ? 'bg-destructive text-white animate-pulse' 
              : isFinished
                ? 'bg-black/60 text-white'
                : isMatchLocked
                  ? 'bg-muted-foreground/80 text-white'
                  : urgency === 'critical'
                    ? 'bg-destructive text-white'
                    : urgency === 'warning'
                      ? 'bg-orange-500 text-white'
                      : 'bg-primary/80 text-white'
          }`}>
            {isLive ? 'LIVE' : isFinished ? 'FT' : isMatchLocked ? 'Locked' : `🔒 ${countdownText}`}
          </div>
        </div>

        {/* Score Section - Center with Team Names beside scores */}
        <div className="flex-1 flex items-center justify-center">
          <div className="bg-white/30 backdrop-blur-sm rounded-xl px-4 py-2 shadow-lg flex justify-center">
            {(isFinished || isLive) ? (
              <div className="flex items-center gap-3">
                <span className="text-sm font-semibold text-foreground">{match.homeTeam.name}</span>
                <div className="text-2xl font-bold text-foreground">{displayHomeScore}</div>
                <div className="text-lg text-muted-foreground font-light">-</div>
                <div className="text-2xl font-bold text-foreground">{displayAwayScore}</div>
                <span className="text-sm font-semibold text-foreground">{match.awayTeam.name}</span>
              </div>
            ) : isMatchLocked ? (
              <div className="flex items-center gap-3">
                <span className="text-sm font-semibold text-foreground">{match.homeTeam.name}</span>
                <div className="text-2xl font-bold text-muted-foreground">{displayHomeScore}</div>
                <div className="text-lg text-muted-foreground font-light">-</div>
                <div className="text-2xl font-bold text-muted-foreground">{displayAwayScore}</div>
                <span className="text-sm font-semibold text-foreground">{match.awayTeam.name}</span>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-foreground">{match.homeTeam.name}</span>
                <ScoreSelector 
                  value={homeScore} 
                  onChange={(v) => handleScoreChange('home', v)}
                  disabled={disabled || isMatchLocked}
                />
                <span className="text-lg text-muted-foreground font-medium">:</span>
                <ScoreSelector 
                  value={awayScore} 
                  onChange={(v) => handleScoreChange('away', v)}
                  disabled={disabled || isMatchLocked}
                />
                <span className="text-sm font-semibold text-foreground">{match.awayTeam.name}</span>
              </div>
            )}
          </div>
        </div>

        {/* Prediction Section */}
        {!isFinished && !isLive && (
          <div>
            {disabled ? (
              <div className="flex items-center justify-center gap-2 py-2 px-3 rounded-lg bg-white/90 text-muted-foreground text-xs backdrop-blur-sm">
                <Lock className="w-3 h-3" />
                Log in to save
              </div>
            ) : isMatchLocked ? (
              <div className="flex items-center justify-center gap-2 py-2 px-3 rounded-lg bg-white/90 text-muted-foreground text-xs backdrop-blur-sm">
                <Lock className="w-3 h-3" />
                {isPredicted 
                  ? `Locked: ${prediction.homeScore} - ${prediction.awayScore}` 
                  : 'No prediction'}
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

        {/* Show prediction for live matches */}
        {isLive && prediction && (
          <div className="py-1.5 px-3 rounded-lg text-xs font-medium text-center backdrop-blur-sm bg-white/90 text-muted-foreground">
            Your prediction: {prediction.homeScore} - {prediction.awayScore}
          </div>
        )}

        {/* Result comparison for finished matches */}
        {isFinished && prediction && (
          <div className="py-1.5 px-3 rounded-lg text-xs font-medium text-center backdrop-blur-sm bg-white/90 text-muted-foreground">
            Your prediction: {prediction.homeScore} - {prediction.awayScore}
          </div>
        )}

        {/* Show no prediction message for live/finished without prediction */}
        {(isLive || isFinished) && !prediction && (
          <div className="py-1.5 px-3 rounded-lg text-xs font-medium text-center backdrop-blur-sm bg-white/90 text-muted-foreground">
            No prediction submitted
          </div>
        )}
      </div>
    </motion.div>
  );
};
