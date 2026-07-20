import { useState } from 'react';
import { motion } from 'framer-motion';
import { Lock, Check, Trophy, Star } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { CustomBoostAward, CustomBoostPrediction, CustomBoostResult } from '@/hooks/useCustomBoostAwards';
import { useTeamName } from '@/hooks/useTeamName';
import { useQualifiedTeams } from '@/hooks/useQualifiedTeams';
import { PlayerPicker } from '@/components/PlayerPicker';
import { useLiveMatchesContext } from '@/contexts/LiveMatchesContext';
import { Flag } from '@/components/Flag';
import { useCompetitionsSafe } from '@/contexts/CompetitionContext';
import { parseBoostResult, boostResultIncludes } from '@/lib/boostMatch';


interface CustomBoostAwardCardProps {
  award: CustomBoostAward;
  prediction?: CustomBoostPrediction;
  result?: CustomBoostResult;
  isLocked: boolean;
  onSave: (teamCode: string | null, playerName: string | null) => Promise<boolean>;
  disabled?: boolean;
}

export const CustomBoostAwardCard = ({
  award,
  prediction,
  result,
  isLocked,
  onSave,
  disabled,
}: CustomBoostAwardCardProps) => {
  const { t } = useTranslation();
  const { getTeamName } = useTeamName();
  const { boostsDeadline } = useLiveMatchesContext();
  const [selectedTeam, setSelectedTeam] = useState(prediction?.predicted_team_code || '');
  const [playerName, setPlayerName] = useState(prediction?.predicted_player_name || '');
  const [saving, setSaving] = useState(false);

  const uniqueTeams = useQualifiedTeams();

  const hasChanged = award.prediction_type === 'team'
    ? selectedTeam !== (prediction?.predicted_team_code || '')
    : playerName !== (prediction?.predicted_player_name || '');

  const hasPrediction = award.prediction_type === 'team'
    ? !!prediction?.predicted_team_code
    : !!prediction?.predicted_player_name;

  const isCorrect = result && (
    (award.prediction_type === 'team' && boostResultIncludes(result.result_team_code, prediction?.predicted_team_code)) ||
    (award.prediction_type === 'player' && boostResultIncludes(result.result_player_name, prediction?.predicted_player_name))
  );

  const handleSave = async () => {
    setSaving(true);
    await onSave(
      award.prediction_type === 'team' ? selectedTeam : null,
      award.prediction_type === 'player' ? playerName : null
    );
    setSaving(false);
  };

  const teamKind = useCompetitionsSafe()?.profile.teamKind ?? 'country';
  const getTeamDisplay = (code: string) => {
    const team = uniqueTeams.find((t) => t.code === code);
    if (!team) return code;
    return (
      <span className="inline-flex items-center gap-1.5">
        <Flag code={team.code} crestUrl={team.crestUrl} kind={teamKind} className="w-4" />
        <span>{getTeamName(team.code, team.name)}</span>
      </span>
    );
  };

  // Calculate lock time remaining. ALL boosts (built-in and custom) lock
  // together at the first knockout-match kickoff — see boostsDeadline in
  // LiveMatchesContext. Per-award lock_date columns are now ignored; the
  // matching change is in useCustomBoostAwards.isLocked.
  const getLockTimeInfo = () => {
    if (!boostsDeadline) return null;
    const now = new Date();
    const diff = boostsDeadline.getTime() - now.getTime();
    
    if (diff <= 0) return null;
    
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    // Each unit through its own i18next plural key — see the matching
    // change in BoostAwardCard for the rationale.
    if (days > 0) return t('boost.locksIn', { time: t('boost.daysCount', { count: days }) });

    const hours = Math.floor(diff / (1000 * 60 * 60));
    if (hours > 0) return t('boost.locksIn', { time: t('boost.hoursCount', { count: hours }) });

    const minutes = Math.floor(diff / (1000 * 60));
    return t('boost.locksIn', { time: t('boost.minutesCount', { count: minutes }) });
  };
  
  const lockTimeInfo = getLockTimeInfo();

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <Card className={`overflow-hidden transition-all ${
        result 
          ? isCorrect 
            ? 'ring-2 ring-green-500 bg-green-500/5' 
            : 'opacity-75'
          : ''
      }`}>
        {/* Award Image with Custom Badge */}
        <div className="relative h-32 bg-gradient-to-br from-accent/20 to-primary/20">
          {award.image_url ? (
            <img 
              src={award.image_url} 
              alt={award.title}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <Star className="w-12 h-12 text-accent/50" />
            </div>
          )}
          
          <Badge 
            variant="secondary" 
            className="absolute top-2 left-2 bg-accent text-accent-foreground text-xs font-semibold flex items-center gap-1 pointer-events-none"
          >
            <Star className="w-3 h-3" />
            {t('boost.custom')}
          </Badge>
          
          {isLocked && (
            <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
              <Lock className="w-8 h-8 text-white" />
            </div>
          )}
          {result && isCorrect && (
            <div className="absolute top-2 right-2 bg-green-500 text-white px-2 py-1 rounded-full text-xs font-bold flex items-center gap-1">
              <Trophy className="w-3 h-3" />
              +{award.points_value} pts
            </div>
          )}
        </div>

        <CardContent className="p-4 space-y-3">
          {/* Title and Description */}
          <div>
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-lg">{award.title}</h3>
              <span className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded">
                {award.points_value} pts
              </span>
            </div>
            {award.description && (
              <p className="text-sm text-muted-foreground mt-1">{award.description}</p>
            )}
          </div>

          {/* Lock time info */}
          {lockTimeInfo && !isLocked && (
            <p className="text-xs text-muted-foreground">{lockTimeInfo}</p>
          )}

          {/* Input Section */}
          {!result ? (
            <div className="space-y-2">
              {award.prediction_type === 'team' ? (
                <Select
                  value={selectedTeam}
                  onValueChange={setSelectedTeam}
                  disabled={isLocked || disabled}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={t('boost.selectTeam')} />
                  </SelectTrigger>
                  <SelectContent>
                    {uniqueTeams.map((team) => (
                      <SelectItem key={team.id} value={team.code}>
                        <span className="inline-flex items-center gap-1.5">
                          <Flag code={team.code} crestUrl={team.crestUrl} kind={teamKind} className="w-4" />
                          <span>{getTeamName(team.code, team.name)}</span>
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <PlayerPicker
                  value={playerName}
                  onChange={setPlayerName}
                  disabled={isLocked || disabled}
                />
              )}

              {/* Save / Update button — same flow for team and player. */}
              {!isLocked && !disabled && (
                hasPrediction && !hasChanged ? (
                  <div className="flex items-center justify-center gap-2 py-1.5 px-3 rounded-lg bg-primary/90 text-white text-xs font-medium w-full">
                    <Check className="w-3 h-3" />
                    {award.prediction_type === 'team'
                      ? getTeamDisplay(prediction?.predicted_team_code || '')
                      : prediction?.predicted_player_name}
                  </div>
                ) : (
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={handleSave}
                    disabled={
                      saving ||
                      (award.prediction_type === 'team' ? !selectedTeam : !playerName)
                    }
                    className={`w-full py-1.5 px-3 rounded-lg font-semibold text-xs transition-all ${
                      hasChanged || !hasPrediction
                        ? 'bg-accent text-accent-foreground shadow-md'
                        : 'bg-muted text-muted-foreground'
                    } disabled:opacity-50 disabled:cursor-not-allowed`}
                  >
                    {saving ? t('matchCard.saving') : (hasPrediction ? t('matchCard.update') : t('matchCard.savePrediction'))}
                  </motion.button>
                )
              )}

              {/* Locked state */}
              {isLocked && (
                <div className="text-center text-sm text-muted-foreground py-2">
                  <Lock className="w-4 h-4 inline mr-1" />
                  {hasPrediction ? (
                    <span>
                      {t('boost.locked')}: {award.prediction_type === 'team' 
                        ? getTeamDisplay(prediction?.predicted_team_code || '')
                        : prediction?.predicted_player_name
                      }
                    </span>
                  ) : (
                    <span>{t('boost.noPrediction')}</span>
                  )}
                </div>
              )}
            </div>
          ) : (
            /* Result Display */
            <div className="text-center py-2">
              <div className="text-sm text-muted-foreground mb-1">{t('boost.result')}:</div>
              <div className="font-bold text-lg">
                {award.prediction_type === 'team'
                  ? parseBoostResult(result.result_team_code).map((code, i) => (
                      <span key={code} className="inline-flex items-center">
                        {i > 0 && <span className="mx-1.5 text-muted-foreground">·</span>}
                        {getTeamDisplay(code)}
                      </span>
                    ))
                  : result.result_player_name
                }
              </div>
              {hasPrediction && (
                <div className={`mt-2 text-sm ${isCorrect ? 'text-green-500 font-bold' : 'text-muted-foreground'}`}>
                  {t('boost.yourPrediction')}: {award.prediction_type === 'team' 
                    ? getTeamDisplay(prediction?.predicted_team_code || '')
                    : prediction?.predicted_player_name
                  }
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
};
