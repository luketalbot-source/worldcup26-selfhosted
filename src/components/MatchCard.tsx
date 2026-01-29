import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { Match, Prediction } from '@/types/match';
import { ScoreSelector } from './ScoreSelector';
import { MapPin, Clock, Check, Lock, Zap } from 'lucide-react';
import { getFlagUrl } from '@/lib/flagUtils';
import { useMatchTime, getEffectiveMatchStatus } from '@/hooks/useMatchTime';
import { calculatePredictionPoints } from '@/lib/scoringCalculator';
import { useTeamName } from '@/hooks/useTeamName';

interface MatchCardProps {
  match: Match;
  prediction?: Prediction;
  onPredict: (matchId: string, homeScore: number, awayScore: number) => void;
  disabled?: boolean;
  showGroup?: boolean;
}

export const MatchCard = ({ match, prediction, onPredict, disabled = false, showGroup = false }: MatchCardProps) => {
  const { t } = useTranslation();
  const { getTeamName } = useTeamName();
  const [homeScore, setHomeScore] = useState(prediction?.homeScore ?? 0);
  const [awayScore, setAwayScore] = useState(prediction?.awayScore ?? 0);
  const [hasEdited, setHasEdited] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  
  const { localDate, localTime, isLocked, countdownText, urgency } = useMatchTime(match.date, match.time);
  
  // Get effective status - auto-finishes matches that have been "live" for 3+ hours
  const effectiveStatus = getEffectiveMatchStatus(match.date, match.time, match.status);
  
  // Match is locked if it's within 30 min of start, live, or finished
  const isMatchLocked = isLocked || effectiveStatus === 'live' || effectiveStatus === 'finished';
  const isFinished = effectiveStatus === 'finished';
  const isLive = effectiveStatus === 'live';
  const isPredicted = !!prediction;

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
  };

  // Calculate points for finished matches with predictions
  const predictionResult = isFinished && prediction 
    ? calculatePredictionPoints(
        prediction.homeScore,
        prediction.awayScore,
        match.homeScore ?? null,
        match.awayScore ?? null
      )
    : null;

  const homeFlagUrl = getFlagUrl(match.homeTeam.code);
  const awayFlagUrl = getFlagUrl(match.awayTeam.code);

  // Get translated team names
  const homeTeamName = getTeamName(match.homeTeam.code, match.homeTeam.name);
  const awayTeamName = getTeamName(match.awayTeam.code, match.awayTeam.name);

  // Determine what scores to show in the selector area
  const displayHomeScore = (isLive || isFinished) ? (match.homeScore ?? 0) : homeScore;
  const displayAwayScore = (isLive || isFinished) ? (match.awayScore ?? 0) : awayScore;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className={`relative overflow-hidden rounded-2xl shadow-card border h-[250px] ${
        predictionResult?.resultType === 'exact' 
          ? 'ring-2 ring-fifa-gold border-fifa-gold/50' 
          : predictionResult?.resultType === 'correct'
            ? 'ring-2 ring-fifa-green border-fifa-green/50'
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
      <div className="relative z-10 p-4 h-full flex flex-col">
        {/* Top Row - All Badges */}
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1 bg-black/60 px-2 py-0.5 rounded-full backdrop-blur-sm text-white text-xs">
              <Clock className="w-3 h-3" />
              <span>{localDate} {localTime}</span>
            </div>
            <div className="flex items-center gap-1 bg-black/60 px-2 py-0.5 rounded-full backdrop-blur-sm text-white text-xs">
              <MapPin className="w-3 h-3" />
              <span>{match.city}</span>
            </div>
            {showGroup && match.group && (
              <div className="bg-primary/90 px-2 py-0.5 rounded-full backdrop-blur-sm text-white text-xs font-semibold">
                {t('matches.group', { letter: match.group })}
              </div>
            )}
          </div>
          
          {(isLive || isFinished) && (
            <div className={`px-2 py-0.5 rounded-full text-xs font-semibold backdrop-blur-sm ${
              isLive 
                ? 'bg-destructive text-white animate-pulse' 
                : 'bg-black/60 text-white'
            }`}>
              {isLive ? t('matchCard.live') : t('matchCard.fullTime')}
            </div>
          )}
        </div>

        {/* Score Section - Absolutely centered */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="bg-white/30 backdrop-blur-sm rounded-xl px-4 py-2 shadow-lg pointer-events-auto">
            {(isFinished || isLive) ? (
              <div className="flex items-center gap-3">
                <span className="text-sm font-semibold text-foreground w-24 text-right truncate">{homeTeamName}</span>
                <div className="text-2xl font-bold text-foreground w-8 text-center">{displayHomeScore}</div>
                <div className="text-lg text-muted-foreground font-light">-</div>
                <div className="text-2xl font-bold text-foreground w-8 text-center">{displayAwayScore}</div>
                <span className="text-sm font-semibold text-foreground w-24 text-left truncate">{awayTeamName}</span>
              </div>
            ) : isMatchLocked ? (
              <div className="flex items-center gap-3">
                <span className="text-sm font-semibold text-foreground w-24 text-right truncate">{homeTeamName}</span>
                <div className="text-2xl font-bold text-muted-foreground w-8 text-center">{displayHomeScore}</div>
                <div className="text-lg text-muted-foreground font-light">-</div>
                <div className="text-2xl font-bold text-muted-foreground w-8 text-center">{displayAwayScore}</div>
                <span className="text-sm font-semibold text-foreground w-24 text-left truncate">{awayTeamName}</span>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-foreground w-24 text-right truncate">{homeTeamName}</span>
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
                <span className="text-sm font-semibold text-foreground w-24 text-left truncate">{awayTeamName}</span>
              </div>
            )}
          </div>
        </div>

        {/* Spacer to push prediction section to bottom */}
        <div className="flex-1" />

        {/* Prediction Section */}
        {!isFinished && !isLive && (
          <div className="flex items-center gap-2">
            {/* Countdown Timer */}
            <div className={`px-2 py-1.5 rounded-lg text-xs font-semibold backdrop-blur-sm whitespace-nowrap ${
              isMatchLocked
                ? 'bg-muted-foreground/80 text-white'
                : urgency === 'critical'
                  ? 'bg-destructive text-white'
                  : urgency === 'warning'
                    ? 'bg-orange-500 text-white'
                    : 'bg-primary/80 text-white'
            }`}>
              {isMatchLocked ? <Lock className="w-3 h-3 inline mr-1" /> : <Clock className="w-3 h-3 inline mr-1" />} {isMatchLocked ? t('matchCard.locked') : countdownText}
            </div>
            
            {/* Action Button */}
            <div className="flex-1">
              {disabled ? (
                <div className="flex items-center justify-center gap-2 py-1.5 px-3 rounded-lg bg-white/90 text-muted-foreground text-xs backdrop-blur-sm">
                  <Lock className="w-3 h-3" />
                  {t('matchCard.logInToSave')}
                </div>
              ) : isMatchLocked ? (
                <div className="flex items-center justify-center gap-2 py-1.5 px-3 rounded-lg bg-white/90 text-muted-foreground text-xs backdrop-blur-sm">
                  {isPredicted 
                    ? `${prediction.homeScore} - ${prediction.awayScore}` 
                    : t('matchCard.noPrediction')}
                </div>
              ) : isPredicted && !hasEdited ? (
                <div className="flex items-center justify-center gap-2 py-1.5 px-3 rounded-lg bg-primary/90 text-white text-xs font-medium backdrop-blur-sm">
                  <Check className="w-3 h-3" />
                  {prediction.homeScore} - {prediction.awayScore}
                </div>
              ) : (
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={handleSave}
                  disabled={isSaving}
                  className={`w-full py-1.5 px-3 rounded-lg font-semibold text-xs transition-all backdrop-blur-sm ${
                    hasEdited || !isPredicted
                      ? 'bg-accent text-accent-foreground shadow-md'
                      : 'bg-white/90 text-muted-foreground'
                  }`}
                >
                  {isSaving ? t('matchCard.saving') : (isPredicted ? (hasEdited ? t('matchCard.update') : t('matchCard.saved')) : t('matchCard.savePrediction'))}
                </motion.button>
              )}
            </div>
          </div>
        )}

        {/* Result comparison for finished matches */}
        {isFinished && prediction && predictionResult && (
          <div className={`py-1.5 px-3 rounded-lg text-xs font-medium text-center backdrop-blur-sm flex items-center justify-center gap-2 ${
            predictionResult.resultType === 'exact' 
              ? 'bg-fifa-gold/90 text-white' 
              : predictionResult.resultType === 'correct'
                ? 'bg-fifa-green/90 text-white'
                : 'bg-white/90 text-muted-foreground'
          }`}>
            {predictionResult.resultType === 'exact' && <Zap className="w-3 h-3" />}
            {predictionResult.resultType === 'correct' && <Check className="w-3 h-3" />}
            <span>
              {prediction.homeScore} - {prediction.awayScore}
              {predictionResult.resultType === 'exact' && ` · ${t('matchCard.exactScore')}`}
              {predictionResult.resultType === 'correct' && ` · ${t('matchCard.correctResult')}`}
              {predictionResult.resultType === 'wrong' && ` · ${t('matchCard.wrongResult')}`}
            </span>
          </div>
        )}

        {/* Show prediction for live matches */}
        {isLive && prediction && (
          <div className="py-1.5 px-3 rounded-lg text-xs font-medium text-center backdrop-blur-sm bg-white/90 text-muted-foreground">
            {t('matchCard.yourPrediction', { home: prediction.homeScore, away: prediction.awayScore })}
          </div>
        )}

        {/* Show no prediction message for live/finished without prediction */}
        {(isLive || isFinished) && !prediction && (
          <div className="py-1.5 px-3 rounded-lg text-xs font-medium text-center backdrop-blur-sm bg-white/90 text-muted-foreground">
            {t('matchCard.noPredictionSubmitted')}
          </div>
        )}
      </div>
    </motion.div>
  );
};