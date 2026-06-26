import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { KnockoutMatch } from '@/data/knockoutMatches';
import { Prediction } from '@/types/match';
import { ScoreSelector } from './ScoreSelector';
import { MapPin, Clock, Check, Lock, Zap } from 'lucide-react';
import { getFlagIconCode } from '@/lib/teamFlagCode';
import { useMatchTime } from '@/hooks/useMatchTime';
import { findStadium } from '@/data/stadiums';
import { StadiumCard } from './StadiumCard';
import { ExactPredictionsReveal } from './ExactPredictionsReveal';
import { MatchEvents } from './MatchEvents';
import { calculatePredictionPoints } from '@/lib/scoringCalculator';
import { Flag, CardFlagBackground } from '@/components/Flag';
import { useTeamName } from '@/hooks/useTeamName';

interface KnockoutMatchCardProps {
  match: KnockoutMatch;
  prediction?: Prediction;
  onPredict: (
    matchId: string,
    homeScore: number,
    awayScore: number,
    penaltyHomeScore?: number | null,
    penaltyAwayScore?: number | null,
  ) => void;
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
  const { t } = useTranslation();
  const { getTeamName } = useTeamName();
  const [homeScore, setHomeScore] = useState(prediction?.homeScore ?? 0);
  const [awayScore, setAwayScore] = useState(prediction?.awayScore ?? 0);
  // Predicted shootout score, used only when the predicted score is level
  // (a knockout draw goes to pens). Default 4–3 so the required pick
  // starts decisive; the user adjusts who wins / the score.
  const [penHome, setPenHome] = useState(prediction?.penaltyHomeScore ?? 4);
  const [penAway, setPenAway] = useState(prediction?.penaltyAwayScore ?? 3);
  const [hasEdited, setHasEdited] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [stadiumOpen, setStadiumOpen] = useState(false);
  // Known host stadium -> the location pill opens the stadium info card.
  const stadium = findStadium(match.venue, match.city);

  const { localDate, localTime, isLocked, countdownText, urgency } = useMatchTime(
    match.dateIso ?? match.date,
    match.dateIso ? undefined : match.time
  );

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
      if (prediction.penaltyHomeScore != null) setPenHome(prediction.penaltyHomeScore);
      if (prediction.penaltyAwayScore != null) setPenAway(prediction.penaltyAwayScore);
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

  const handlePenChange = (team: 'home' | 'away', score: number) => {
    if (disabled || isMatchLocked) return;
    setHasEdited(true);
    if (team === 'home') setPenHome(score);
    else setPenAway(score);
  };

  // A level knockout prediction goes to pens, so the shootout pick is
  // required and must be decisive (no tie).
  const isDrawPrediction = homeScore === awayScore;
  const penDecisive = penHome !== penAway;
  const needsPenWinner = isDrawPrediction && !penDecisive;

  const handleSave = async () => {
    if (disabled || isMatchLocked || needsPenWinner) return;
    setIsSaving(true);
    await onPredict(
      match.id,
      homeScore,
      awayScore,
      isDrawPrediction ? penHome : null,
      isDrawPrediction ? penAway : null,
    );
    setHasEdited(false);
    setIsSaving(false);
  };

  // Calculate points for finished matches with predictions
  const predictionResult = isFinished && prediction
    ? calculatePredictionPoints(
        prediction.homeScore,
        prediction.awayScore,
        match.homeScore ?? null,
        match.awayScore ?? null,
        {
          predictedPenHome: prediction.penaltyHomeScore,
          predictedPenAway: prediction.penaltyAwayScore,
          actualPenHome: match.penaltyHomeScore ?? null,
          actualPenAway: match.penaltyAwayScore ?? null,
          wentToPens: match.duration === 'PENALTY_SHOOTOUT',
        },
      )
    : null;

  // Bundled-SVG flags — same reasoning as MatchCard: the flagcdn.com
  // <img> path was network-dependent (flaky behind corporate proxies)
  // and its lookup table missed FD's renamed TLAs (URY/CUW). Knockout
  // cards show TBD placeholders until the bracket fills, so the
  // no-flag fallback branch matters more here.
  const hasHomeFlag = !!getFlagIconCode(match.homeTeam.code);
  const hasAwayFlag = !!getFlagIconCode(match.awayTeam.code);

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
      className={`relative overflow-hidden rounded-2xl shadow-card border min-h-[250px] ${
        predictionResult?.resultType === 'exact' 
          ? 'ring-2 ring-fifa-gold border-fifa-gold/50' 
          : predictionResult?.resultType === 'correct'
            ? 'ring-2 ring-fifa-green border-fifa-green/50'
            : isHighlighted 
              ? 'border-fifa-gold/50' 
              : 'border-border/50'
      } ${disabled ? 'opacity-80' : ''}`}
    >
      {/* Background Flags Container */}
      <div className="absolute inset-0 flex">
        {/* Home Team Flag - Left Side */}
        <div className="relative w-1/2 h-full overflow-hidden">
          {hasHomeFlag ? (
            <>
              <CardFlagBackground code={match.homeTeam.code} label={match.homeTeam.name} />
              <div className="absolute inset-0 bg-gradient-to-r from-transparent from-40% to-white to-100%" />
              <div className="absolute inset-0 bg-black/20" />
            </>
          ) : (
            <div className="absolute inset-0 bg-gradient-to-r from-muted to-white flex items-center justify-center">
              <Flag code={match.homeTeam.code} className="w-12 opacity-30" />
            </div>
          )}
        </div>

        {/* Away Team Flag - Right Side */}
        <div className="relative w-1/2 h-full overflow-hidden">
          {hasAwayFlag ? (
            <>
              <CardFlagBackground code={match.awayTeam.code} label={match.awayTeam.name} />
              <div className="absolute inset-0 bg-gradient-to-l from-transparent from-40% to-white to-100%" />
              <div className="absolute inset-0 bg-black/20" />
            </>
          ) : (
            <div className="absolute inset-0 bg-gradient-to-l from-muted to-white flex items-center justify-center">
              <Flag code={match.awayTeam.code} className="w-12 opacity-30" />
            </div>
          )}
        </div>
      </div>

      {/* Content Overlay */}
      <div className="relative z-10 p-4 h-full flex flex-col">
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
            {(match.city || match.venue) &&
              (stadium ? (
                <button
                  type="button"
                  onClick={() => setStadiumOpen(true)}
                  aria-label={`${t('stadium.ariaOpen')}: ${stadium.name}`}
                  className="flex items-center gap-1 bg-black/60 px-2 py-0.5 rounded-full backdrop-blur-sm text-white text-xs ring-1 ring-white/25 active:bg-black/80 transition-colors"
                >
                  <MapPin className="w-3 h-3" />
                  <span>{match.city || match.venue}</span>
                  <span className="text-white/70 text-[10px] ml-0.5" aria-hidden>ⓘ</span>
                </button>
              ) : (
                <div className="flex items-center gap-1 bg-black/60 px-2 py-0.5 rounded-full backdrop-blur-sm text-white text-xs">
                  <MapPin className="w-3 h-3" />
                  <span>{match.city || match.venue}</span>
                </div>
              ))}
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

        {/* Score section. For live/finished it sits in NORMAL flow so
            goal scorers + bookings (and the who-called-it reveal below)
            can stack beneath it and the card grows via min-h. For
            upcoming/locked it stays absolutely centred — the bracket's
            signature look — over the fixed 250px card. */}
        {(isFinished || isLive) ? (
          <div className="relative z-10 mt-3 flex flex-col items-center gap-2">
            <div className="bg-white/30 backdrop-blur-sm rounded-xl px-4 py-2 shadow-lg">
              <div className="flex items-center gap-3">
                <span className="text-sm font-semibold text-foreground w-24 text-right truncate">{homeTeamName}</span>
                <div className="text-2xl font-bold text-foreground w-8 text-center">{displayHomeScore}</div>
                <div className="text-lg text-muted-foreground font-light">-</div>
                <div className="text-2xl font-bold text-foreground w-8 text-center">{displayAwayScore}</div>
                <span className="text-sm font-semibold text-foreground w-24 text-left truncate">{awayTeamName}</span>
              </div>
              {/* AET / PSO annotation. Renders only on knockout matches
                  that needed extra time or penalties; FD's `duration`
                  flag drives the visibility. The score above is the
                  regulation+ET total — this line tells a reader who
                  actually advanced. i18n keys match local convention
                  (de: n.V., fr: a.p., it: d.t.s., …). */}
              {(match.duration === 'EXTRA_TIME' || match.duration === 'PENALTY_SHOOTOUT') && (
                <div className="mt-1 text-center text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
                  {(() => {
                    const aet = t('matchCard.aet', 'AET');
                    if (
                      match.duration === 'PENALTY_SHOOTOUT' &&
                      match.penaltyHomeScore != null &&
                      match.penaltyAwayScore != null
                    ) {
                      const homeWon = match.penaltyHomeScore > match.penaltyAwayScore;
                      const winner = homeWon ? homeTeamName : awayTeamName;
                      const score = homeWon
                        ? `${match.penaltyHomeScore}–${match.penaltyAwayScore}`
                        : `${match.penaltyAwayScore}–${match.penaltyHomeScore}`;
                      return `${aet} · ${t('matchCard.wonOnPens', { winner, score })}`;
                    }
                    return aet;
                  })()}
                </div>
              )}
            </div>
            <MatchEvents goals={match.goals ?? []} bookings={match.bookings ?? []} />
          </div>
        ) : (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="bg-white/30 backdrop-blur-sm rounded-xl px-4 py-2 shadow-lg pointer-events-auto">
              {isMatchLocked ? (
                <div className="flex items-center gap-3">
                  <span className="text-sm font-semibold text-foreground w-24 text-right truncate">{homeTeamName}</span>
                  <div className="text-2xl font-bold text-muted-foreground w-8 text-center">{displayHomeScore}</div>
                  <div className="text-lg text-muted-foreground font-light">-</div>
                  <div className="text-2xl font-bold text-muted-foreground w-8 text-center">{displayAwayScore}</div>
                  <span className="text-sm font-semibold text-foreground w-24 text-left truncate">{awayTeamName}</span>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2">
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

                  {/* Drawn knockout → goes to penalties. Require a decisive
                      shootout pick (who advances + the score). Shown only
                      while predicting a level score. */}
                  {isDrawPrediction && (
                    <div className="flex flex-col items-center gap-1 border-t border-border/40 pt-2 w-full">
                      <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                        {t('matchCard.penalties', 'Penalty shootout')}
                      </span>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-foreground w-24 text-right truncate">{homeTeamName}</span>
                        <ScoreSelector
                          value={penHome}
                          onChange={(v) => handlePenChange('home', v)}
                          disabled={disabled || isMatchLocked}
                        />
                        <span className="text-sm text-muted-foreground font-medium">:</span>
                        <ScoreSelector
                          value={penAway}
                          onChange={(v) => handlePenChange('away', v)}
                          disabled={disabled || isMatchLocked}
                        />
                        <span className="text-xs font-semibold text-foreground w-24 text-left truncate">{awayTeamName}</span>
                      </div>
                      {needsPenWinner && (
                        <span className="text-[10px] text-destructive">
                          {t('matchCard.penNeedsWinner', 'Pick a shootout winner — no draws')}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Spacer pushes the prediction button to the bottom — only for
            upcoming/locked, where the score floats absolute. For
            live/finished the content stacks top-down (no spacer) so the
            score, events and reveal read in order. */}
        {!isFinished && !isLive && <div className="flex-1" />}

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
                  disabled={isSaving || (!hasEdited && !isPredicted) || needsPenWinner}
                  className={`w-full py-1.5 px-3 rounded-lg font-semibold text-xs transition-all backdrop-blur-sm ${
                    hasEdited && !needsPenWinner
                      ? 'bg-accent text-accent-foreground shadow-md'
                      : 'bg-white/90 text-muted-foreground'
                  }`}
                >
                  {isSaving ? t('matchCard.saving') : (isPredicted ? t('matchCard.update') : t('matchCard.savePrediction'))}
                </motion.button>
              )}
            </div>
          </div>
        )}

        {/* Show prediction for live matches */}
        {isLive && prediction && (
          <div className="py-1.5 px-3 rounded-lg text-xs font-medium text-center backdrop-blur-sm bg-white/90 text-muted-foreground">
            {t('matchCard.yourPrediction', { home: prediction.homeScore, away: prediction.awayScore })}
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
              {predictionResult.penaltyBonus > 0 && ` · ${t('matchCard.penBonus', { count: predictionResult.penaltyBonus })}`}
            </span>
          </div>
        )}

        {/* Show no prediction message for live/finished without prediction */}
        {(isLive || isFinished) && !prediction && (
          <div className="py-1.5 px-3 rounded-lg text-xs font-medium text-center backdrop-blur-sm bg-white/90 text-muted-foreground">
            {t('matchCard.noPredictionSubmitted')}
          </div>
        )}

        {/* Who-called-it reveal — finished matches only; lazy-fetches on tap. */}
        {isFinished && <ExactPredictionsReveal matchId={match.id} />}
      </div>

      {stadium && (
        <StadiumCard stadium={stadium} open={stadiumOpen} onOpenChange={setStadiumOpen} />
      )}
    </motion.div>
  );
};