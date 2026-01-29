import { useState, useEffect, useMemo } from 'react';
import { Loader2, Trophy, Save, Check, RotateCcw } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import { teams as allTeams } from '@/data/teams';

interface BoostAward {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  prediction_type: 'team' | 'player';
  points_value: number;
}

interface BoostResult {
  id?: string;
  award_id: string;
  result_team_code: string | null;
  result_player_name: string | null;
}

// Get unique teams by code (filter out duplicates from test group)
const getUniqueTeams = () => {
  const seen = new Set<string>();
  return allTeams
    .filter(team => {
      if (team.group === 'X') return false;
      if (seen.has(team.code)) return false;
      seen.add(team.code);
      return true;
    })
    .sort((a, b) => a.name.localeCompare(b.name));
};

export const AdminBoostResults = () => {
  const [awards, setAwards] = useState<BoostAward[]>([]);
  const [results, setResults] = useState<Map<string, BoostResult>>(new Map());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [savedRecently, setSavedRecently] = useState<Set<string>>(new Set());
  
  // Local form state
  const [formValues, setFormValues] = useState<Map<string, { teamCode: string; playerName: string }>>(new Map());
  const [resetting, setResetting] = useState(false);

  const uniqueTeams = useMemo(() => getUniqueTeams(), []);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        // Fetch awards
        const { data: awardsData, error: awardsError } = await supabase
          .from('boost_awards')
          .select('id, slug, name, description, prediction_type, points_value')
          .order('display_order');

        if (awardsError) throw awardsError;
        setAwards((awardsData || []) as BoostAward[]);

        // Fetch existing results
        const { data: resultsData, error: resultsError } = await supabase
          .from('boost_results')
          .select('*');

        if (resultsError) throw resultsError;

        // Convert to map
        const resultsMap = new Map<string, BoostResult>();
        const formMap = new Map<string, { teamCode: string; playerName: string }>();
        
        (resultsData || []).forEach((r: BoostResult) => {
          resultsMap.set(r.award_id, r);
          formMap.set(r.award_id, {
            teamCode: r.result_team_code || '',
            playerName: r.result_player_name || '',
          });
        });
        
        setResults(resultsMap);
        setFormValues(formMap);
      } catch (err) {
        console.error('Error fetching boost data:', err);
        toast.error('Failed to load boost awards');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  const handleSave = async (award: BoostAward) => {
    setSaving(award.id);
    
    const formValue = formValues.get(award.id) || { teamCode: '', playerName: '' };
    
    try {
      const { error } = await supabase
        .from('boost_results')
        .upsert({
          award_id: award.id,
          result_team_code: award.prediction_type === 'team' ? formValue.teamCode || null : null,
          result_player_name: award.prediction_type === 'player' ? formValue.playerName || null : null,
        }, {
          onConflict: 'award_id',
        });

      if (error) throw error;

      // Update local state
      const newResults = new Map(results);
      newResults.set(award.id, {
        award_id: award.id,
        result_team_code: award.prediction_type === 'team' ? formValue.teamCode : null,
        result_player_name: award.prediction_type === 'player' ? formValue.playerName : null,
      });
      setResults(newResults);
      
      // Show saved indicator
      setSavedRecently(prev => new Set(prev).add(award.id));
      setTimeout(() => {
        setSavedRecently(prev => {
          const next = new Set(prev);
          next.delete(award.id);
          return next;
        });
      }, 2000);
      
      toast.success(`Result saved for ${award.name}`);
    } catch (err) {
      console.error('Error saving result:', err);
      toast.error('Failed to save result');
    } finally {
      setSaving(null);
    }
  };

  const handleResetAll = async () => {
    setResetting(true);
    try {
      const { error } = await supabase
        .from('boost_results')
        .delete()
        .neq('award_id', '00000000-0000-0000-0000-000000000000'); // Delete all rows

      if (error) throw error;

      // Clear local state
      setResults(new Map());
      setFormValues(new Map());
      
      toast.success('All boost results have been reset');
    } catch (err) {
      console.error('Error resetting results:', err);
      toast.error('Failed to reset results');
    } finally {
      setResetting(false);
    }
  };

  const updateFormValue = (awardId: string, field: 'teamCode' | 'playerName', value: string) => {
    const newFormValues = new Map(formValues);
    const current = newFormValues.get(awardId) || { teamCode: '', playerName: '' };
    newFormValues.set(awardId, { ...current, [field]: value });
    setFormValues(newFormValues);
  };

  const getTeamDisplay = (code: string) => {
    const team = uniqueTeams.find(t => t.code === code);
    return team ? `${team.flag} ${team.name}` : code;
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="py-8">
          <div className="flex items-center justify-center">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Trophy className="w-5 h-5" />
              Boost Results
            </CardTitle>
            <CardDescription>
              Set the final results for each boost award. Players who predicted correctly will earn bonus points.
            </CardDescription>
          </div>
          
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" size="sm" disabled={resetting || results.size === 0}>
                {resetting ? (
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                ) : (
                  <RotateCcw className="w-4 h-4 mr-2" />
                )}
                Reset All
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Reset All Boost Results?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will delete all boost results and allow users to see their predictions again without any scoring. 
                  This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={handleResetAll} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                  Reset All
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {awards.map((award) => {
          const formValue = formValues.get(award.id) || { teamCode: '', playerName: '' };
          const existingResult = results.get(award.id);
          const isSaving = saving === award.id;
          const isSavedRecently = savedRecently.has(award.id);
          
          const hasChanged = award.prediction_type === 'team'
            ? formValue.teamCode !== (existingResult?.result_team_code || '')
            : formValue.playerName !== (existingResult?.result_player_name || '');

          return (
            <div
              key={award.id}
              className="flex items-center gap-4 p-4 border rounded-lg"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h4 className="font-medium">{award.name}</h4>
                  <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded">
                    {award.prediction_type === 'team' ? 'Team' : 'Player'}
                  </span>
                </div>
                {award.description && (
                  <p className="text-sm text-muted-foreground truncate">{award.description}</p>
                )}
              </div>

              <div className="flex items-center gap-2">
                {award.prediction_type === 'team' ? (
                  <Select
                    value={formValue.teamCode}
                    onValueChange={(value) => updateFormValue(award.id, 'teamCode', value)}
                  >
                    <SelectTrigger className="w-[200px]">
                      <SelectValue placeholder="Select winner..." />
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
                    value={formValue.playerName}
                    onChange={(e) => updateFormValue(award.id, 'playerName', e.target.value)}
                    className="w-[200px]"
                  />
                )}

                <Button
                  size="sm"
                  disabled={isSaving || !hasChanged}
                  onClick={() => handleSave(award)}
                >
                  {isSaving ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : isSavedRecently ? (
                    <Check className="w-4 h-4" />
                  ) : (
                    <Save className="w-4 h-4" />
                  )}
                </Button>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
};
