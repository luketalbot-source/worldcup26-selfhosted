import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { KnockoutMatch } from '@/data/knockoutMatches';
import { Prediction } from '@/types/match';
import { ScoreSelector } from './ScoreSelector';
import { MapPin, Clock, Check, Lock, Trophy } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { getFlagUrl } from '@/lib/flagUtils';

interface KnockoutMatchCardProps {
  match: KnockoutMatch;
  prediction?: Prediction;
  onPredict: (matchId: string, homeScore: number, awayScore: number) => void;
  disabled?: boolean;
  isHighlighted?: boolean;
}

const stageLabels: Record<string, string> = {
  round32: 'Round of 32',
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
  
  const homeFlagUrl = getFlagUrl(match.homeTeam.code);
  const awayFlagUrl = getFlagUrl(match.awayTeam.code);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className={`relative overflow-hidden rounded-2xl shadow-card border h-[400px] ${
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
              {/* Gradient fade to white on right - stronger fade */}
              <div className="absolute inset-0 bg-gradient-to-r from-transparent from-40% to-white to-100%" />
              {/* Darken overlay for better text readability */}
              <div className="absolute inset-0 bg-black/20" />
            </>
          ) : (
            <div className="absolute inset-0 bg-gradient-to-r from-muted to-white flex items-center justify-center">
              <span className="text-6xl opacity-30">{match.homeTeam.flag}</span>
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
              {/* Gradient fade to white on left - stronger fade */}
              <div className="absolute inset-0 bg-gradient-to-l from-transparent from-40% to-white to-100%" />
              {/* Darken overlay for better text readability */}
              <div className="absolute inset-0 bg-black/20" />
            </>
          ) : (
            <div className="absolute inset-0 bg-gradient-to-l from-muted to-white flex items-center justify-center">
              <span className="text-6xl opacity-30">{match.awayTeam.flag}</span>
            </div>
          )}
        </div>
      </div>

      {/* Content Overlay */}
      <div className="relative z-10 p-4 h-full flex flex-col">
        {/* Top Row - Match Number & Stage & Status */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-black/60 text-white backdrop-blur-sm">
              {match.bracketPosition}
            </span>
            <span className={`px-2 py-0.5 rounded-full text-xs font-semibold backdrop-blur-sm ${
              match.stage === 'final' 
                ? 'bg-fifa-gold/80 text-white' 
                : 'bg-fifa-coral/80 text-white'
            }`}>
              {match.stage === 'final' && <Trophy className="w-3 h-3 inline mr-1" />}
              {stageLabels[match.stage]}
            </span>
          </div>
          
          <div className={`px-2 py-0.5 rounded-full text-xs font-semibold backdrop-blur-sm ${
            match.status === 'live' 
              ? 'bg-destructive text-white animate-pulse' 
              : match.status === 'finished'
                ? 'bg-black/60 text-white'
                : 'bg-primary/80 text-white'
          }`}>
            {match.status === 'live' ? 'LIVE' : match.status === 'finished' ? 'FT' : 'Upcoming'}
          </div>
        </div>

        {/* Score Section - Center with Team Names */}
        <div className="flex-1 flex items-center justify-center">
          <div className="bg-white/95 backdrop-blur-sm rounded-2xl px-6 py-4 shadow-lg w-full max-w-[320px]">
            {isFinished ? (
              <div className="flex items-center justify-between gap-2">
                <div className="flex-1 text-center">
                  <div className="text-sm font-semibold text-foreground truncate mb-1">{match.homeTeam.name}</div>
                  <div className="text-3xl font-bold text-foreground">{match.homeScore}</div>
                </div>
                <div className="text-xl text-muted-foreground font-light px-2">-</div>
                <div className="flex-1 text-center">
                  <div className="text-sm font-semibold text-foreground truncate mb-1">{match.awayTeam.name}</div>
                  <div className="text-3xl font-bold text-foreground">{match.awayScore}</div>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between gap-2">
                <div className="flex-1 text-center">
                  <div className="text-sm font-semibold text-foreground truncate mb-2">
                    {isTBD && match.homeTeam.code === 'TBD' ? match.homeTeam.name : match.homeTeam.name}
                  </div>
                  <ScoreSelector 
                    value={homeScore} 
                    onChange={(v) => handleScoreChange('home', v)}
                    disabled={disabled}
                  />
                </div>
                <span className="text-xl text-muted-foreground font-medium px-2">:</span>
                <div className="flex-1 text-center">
                  <div className="text-sm font-semibold text-foreground truncate mb-2">
                    {isTBD && match.awayTeam.code === 'TBD' ? match.awayTeam.name : match.awayTeam.name}
                  </div>
                  <ScoreSelector 
                    value={awayScore} 
                    onChange={(v) => handleScoreChange('away', v)}
                    disabled={disabled}
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Match Info */}
        <div className="flex items-center justify-center gap-3 text-xs text-white mb-3">
          <div className="flex items-center gap-1 bg-black/40 px-2 py-1 rounded-full backdrop-blur-sm">
            <Clock className="w-3 h-3" />
            <span>{match.date}, {match.time}</span>
          </div>
          <div className="flex items-center gap-1 bg-black/40 px-2 py-1 rounded-full backdrop-blur-sm">
            <MapPin className="w-3 h-3" />
            <span>{match.city}</span>
          </div>
        </div>

        {/* Prediction Section */}
        {!isFinished && (
          <div>
            {disabled ? (
              <div className="flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-white/90 text-muted-foreground text-sm backdrop-blur-sm">
                <Lock className="w-4 h-4" />
                Log in to save predictions
              </div>
            ) : isPredicted && !hasEdited ? (
              <div className="flex items-center justify-center gap-2 py-2 px-4 rounded-lg bg-primary/90 text-white text-sm font-medium backdrop-blur-sm">
                <Check className="w-4 h-4" />
                Predicted: {prediction.homeScore} - {prediction.awayScore}
              </div>
            ) : (
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={handleSave}
                disabled={isSaving || (!hasEdited && !isPredicted)}
                className={`w-full py-3 px-4 rounded-xl font-semibold text-sm transition-all backdrop-blur-sm ${
                  hasEdited
                    ? 'bg-accent text-accent-foreground shadow-md'
                    : 'bg-white/90 text-muted-foreground'
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
