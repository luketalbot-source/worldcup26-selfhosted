import { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Lock, Check, Trophy, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
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
  const [selectedTeam, setSelectedTeam] = useState(prediction?.predicted_team_code || '');
  const [playerName, setPlayerName] = useState(prediction?.predicted_player_name || '');
  const [saving, setSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);

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
    const success = await onSave(
      award.prediction_type === 'team' ? selectedTeam : null,
      award.prediction_type === 'player' ? playerName : null
    );
    setSaving(false);
    if (success) {
      setJustSaved(true);
      setTimeout(() => setJustSaved(false), 2000);
    }
  };

  const getTeamDisplay = (code: string) => {
    const team = uniqueTeams.find(t => t.code === code);
    return team ? `${team.flag} ${team.name}` : code;
  };

  // Calculate lock time remaining
  const getLockTimeInfo = () => {
    if (!award.lock_date) return null;
    const lockDate = new Date(award.lock_date);
    const now = new Date();
    const diff = lockDate.getTime() - now.getTime();
    
    if (diff <= 0) return null;
    
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    if (days > 0) return `Locks in ${days} days`;
    
    const hours = Math.floor(diff / (1000 * 60 * 60));
    if (hours > 0) return `Locks in ${hours}h`;
    
    const minutes = Math.floor(diff / (1000 * 60));
    return `Locks in ${minutes}m`;
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
        {/* Award Image */}
        {award.image_url && (
          <div className="relative h-32 bg-gradient-to-br from-primary/20 to-accent/20">
            <img 
              src={award.image_url} 
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
              <h3 className="font-bold text-lg">{award.name}</h3>
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
                    <SelectValue placeholder="Select a team..." />
                  </SelectTrigger>
                  <SelectContent>
                    {uniqueTeams.map((team) => (
                      <SelectItem key={team.id} value={team.code}>
                        {team.flag} {team.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  placeholder="Enter player name..."
                  value={playerName}
                  onChange={(e) => setPlayerName(e.target.value)}
                  disabled={isLocked || disabled}
                />
              )}

              {/* Save Button */}
              {!isLocked && !disabled && (
                <Button
                  className="w-full"
                  size="sm"
                  disabled={saving || !hasChanged || (award.prediction_type === 'team' ? !selectedTeam : !playerName)}
                  onClick={handleSave}
                >
                  {saving ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Saving...
                    </>
                  ) : justSaved ? (
                    <>
                      <Check className="w-4 h-4 mr-2" />
                      Saved!
                    </>
                  ) : hasPrediction ? (
                    'Update Prediction'
                  ) : (
                    'Save Prediction'
                  )}
                </Button>
              )}

              {/* Locked state */}
              {isLocked && (
                <div className="text-center text-sm text-muted-foreground py-2">
                  <Lock className="w-4 h-4 inline mr-1" />
                  {hasPrediction ? (
                    <span>
                      Locked: {award.prediction_type === 'team' 
                        ? getTeamDisplay(prediction?.predicted_team_code || '')
                        : prediction?.predicted_player_name
                      }
                    </span>
                  ) : (
                    <span>No prediction</span>
                  )}
                </div>
              )}
            </div>
          ) : (
            /* Result Display */
            <div className="text-center py-2">
              <div className="text-sm text-muted-foreground mb-1">Result:</div>
              <div className="font-bold text-lg">
                {award.prediction_type === 'team' 
                  ? getTeamDisplay(result.result_team_code || '')
                  : result.result_player_name
                }
              </div>
              {hasPrediction && (
                <div className={`mt-2 text-sm ${isCorrect ? 'text-green-500 font-bold' : 'text-muted-foreground'}`}>
                  Your prediction: {award.prediction_type === 'team' 
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
