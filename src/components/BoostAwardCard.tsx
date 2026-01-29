import { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Lock, Check, Trophy } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { teams as allTeams } from '@/data/teams';
import { BoostAward, BoostPrediction, BoostResult } from '@/hooks/useBoostAwards';
import { boostImages } from '@/assets/boost';
import { useTeamName } from '@/hooks/useTeamName';

// Get unique teams by code (filter out duplicates from test group)
const getUniqueTeams = () => {
  const seen = new Set<string>();
  return allTeams
    .filter(team => {
      if (team.group === 'X') return false; // Exclude test group
      if (seen.has(team.code)) return false;
      seen.add(team.code);
      return true;
    })
    .sort((a, b) => a.name.localeCompare(b.name));
};

// Map award slugs to translation keys
const getAwardTranslationKey = (slug: string): { name: string; desc: string } => {
  const slugToKey: Record<string, string> = {
    'winners': 'winners',
    'golden-boot': 'goldenBoot',
    'golden-ball': 'goldenBall',
    'golden-glove': 'goldenGlove',
    'young-player': 'youngPlayer',
    'fair-play': 'fairPlay',
    'goal-rush': 'goalRush',
    'flash': 'flash',
    'entertaining': 'entertaining',
    'shame': 'shame',
    'wooden-spoon': 'woodenSpoon',
  };
  const key = slugToKey[slug] || slug;
  return {
    name: `boost.awards.${key}`,
    desc: `boost.awards.${key}Desc`,
  };
};

interface BoostAwardCardProps {
  award: BoostAward;
  prediction?: BoostPrediction;
  result?: BoostResult;
  isLocked: boolean;
  onSave: (teamCode: string | null, playerName: string | null) => Promise<boolean>;
  disabled?: boolean;
}

export const BoostAwardCard = ({
  award,
  prediction,
  result,
  isLocked,
  onSave,
  disabled,
}: BoostAwardCardProps) => {
  const { t } = useTranslation();
  const { getTeamName } = useTeamName();
  const [selectedTeam, setSelectedTeam] = useState(prediction?.predicted_team_code || '');
  const [playerName, setPlayerName] = useState(prediction?.predicted_player_name || '');
  const [saving, setSaving] = useState(false);

  const uniqueTeams = useMemo(() => getUniqueTeams(), []);

  const hasChanged = award.prediction_type === 'team'
    ? selectedTeam !== (prediction?.predicted_team_code || '')
    : playerName !== (prediction?.predicted_player_name || '');

  const hasPrediction = award.prediction_type === 'team'
    ? !!prediction?.predicted_team_code
    : !!prediction?.predicted_player_name;

  const isCorrect = result && (
    (award.prediction_type === 'team' && prediction?.predicted_team_code === result.result_team_code) ||
    (award.prediction_type === 'player' && prediction?.predicted_player_name === result.result_player_name)
  );

  const handleSave = async () => {
    setSaving(true);
    await onSave(
      award.prediction_type === 'team' ? selectedTeam : null,
      award.prediction_type === 'player' ? playerName : null
    );
    setSaving(false);
  };

  const getTeamDisplay = (code: string) => {
    const team = uniqueTeams.find(t => t.code === code);
    return team ? `${team.flag} ${getTeamName(team.code, team.name)}` : code;
  };

  // Calculate lock time remaining
  const getLockTimeInfo = () => {
    if (!award.lock_date) return null;
    const lockDate = new Date(award.lock_date);
    const now = new Date();
    const diff = lockDate.getTime() - now.getTime();
    
    if (diff <= 0) return null;
    
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    if (days > 0) return t('boost.locksIn', { time: `${days} days` });
    
    const hours = Math.floor(diff / (1000 * 60 * 60));
    if (hours > 0) return t('boost.locksIn', { time: `${hours}h` });
    
    const minutes = Math.floor(diff / (1000 * 60));
    return t('boost.locksIn', { time: `${minutes}m` });
  };

  // Get the image from imports
  const imageUrl = boostImages[award.slug];
  
  const lockTimeInfo = getLockTimeInfo();
  
  // Get translated award name and description
  const awardKeys = getAwardTranslationKey(award.slug);
  const translatedName = t(awardKeys.name, award.name);
  const translatedDesc = t(awardKeys.desc, award.description || '');

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
        {/* Award Image */}
        {imageUrl && (
          <div className="relative h-32 bg-gradient-to-br from-primary/20 to-accent/20">
            <img 
              src={imageUrl} 
              alt={award.name}
              className="w-full h-full object-cover"
            />
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
        )}

        <CardContent className="p-4 space-y-3">
          {/* Title and Description */}
          <div>
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-lg">{translatedName}</h3>
              <span className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded">
                {award.points_value} pts
              </span>
            </div>
            {translatedDesc && (
              <p className="text-sm text-muted-foreground mt-1">{translatedDesc}</p>
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
                        {team.flag} {getTeamName(team.code, team.name)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Select disabled>
                  <SelectTrigger>
                    <SelectValue placeholder={t('boost.playerListNotReady')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="placeholder">Placeholder</SelectItem>
                  </SelectContent>
                </Select>
              )}

              {/* Save Button - visible but disabled for player type */}
              {!isLocked && !disabled && (
                hasPrediction && !hasChanged && award.prediction_type === 'team' ? (
                  <div className="flex items-center justify-center gap-2 py-1.5 px-3 rounded-lg bg-primary/90 text-white text-xs font-medium w-full">
                    <Check className="w-3 h-3" />
                    {getTeamDisplay(prediction?.predicted_team_code || '')}
                  </div>
                ) : (
                  <motion.button
                    whileHover={{ scale: award.prediction_type === 'player' ? 1 : 1.02 }}
                    whileTap={{ scale: award.prediction_type === 'player' ? 1 : 0.98 }}
                    onClick={handleSave}
                    disabled={saving || !selectedTeam || award.prediction_type === 'player'}
                    className={`w-full py-1.5 px-3 rounded-lg font-semibold text-xs transition-all ${
                      award.prediction_type === 'player'
                        ? 'bg-muted text-muted-foreground'
                        : hasChanged || !hasPrediction
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
                  ? getTeamDisplay(result.result_team_code || '')
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
