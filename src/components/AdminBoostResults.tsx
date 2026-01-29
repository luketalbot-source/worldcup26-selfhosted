import { useState, useEffect, useMemo } from 'react';
import { Loader2, Trophy, Save, Check, RotateCcw, Settings } from 'lucide-react';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
  const [resettingAward, setResettingAward] = useState<string | null>(null);
  
  // Points editing state
  const [pointsValues, setPointsValues] = useState<Map<string, number>>(new Map());
  const [savingPoints, setSavingPoints] = useState<string | null>(null);
  const [savedPointsRecently, setSavedPointsRecently] = useState<Set<string>>(new Set());

  const uniqueTeams = useMemo(() => getUniqueTeams(), []);

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

      // Initialize points values
      const pointsMap = new Map<string, number>();
      (awardsData || []).forEach((a: BoostAward) => {
        pointsMap.set(a.id, a.points_value);
      });
      setPointsValues(pointsMap);

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

  useEffect(() => {
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

  const handleResetAward = async (award: BoostAward) => {
    setResettingAward(award.id);
    try {
      const { error } = await supabase
        .from('boost_results')
        .delete()
        .eq('award_id', award.id);

      if (error) throw error;

      // Clear local state for this award
      const newResults = new Map(results);
      newResults.delete(award.id);
      setResults(newResults);

      const newFormValues = new Map(formValues);
      newFormValues.delete(award.id);
      setFormValues(newFormValues);
      
      toast.success(`Result reset for ${award.name}`);
    } catch (err) {
      console.error('Error resetting award result:', err);
      toast.error('Failed to reset result');
    } finally {
      setResettingAward(null);
    }
  };

  const updateFormValue = (awardId: string, field: 'teamCode' | 'playerName', value: string) => {
    const newFormValues = new Map(formValues);
    const current = newFormValues.get(awardId) || { teamCode: '', playerName: '' };
    newFormValues.set(awardId, { ...current, [field]: value });
    setFormValues(newFormValues);
  };

  const handleSavePoints = async (award: BoostAward) => {
    setSavingPoints(award.id);
    const newPoints = pointsValues.get(award.id) ?? award.points_value;
    
    try {
      const { error } = await supabase
        .from('boost_awards')
        .update({ points_value: newPoints })
        .eq('id', award.id);

      if (error) throw error;

      // Update local awards state
      setAwards(prev => prev.map(a => 
        a.id === award.id ? { ...a, points_value: newPoints } : a
      ));
      
      // Show saved indicator
      setSavedPointsRecently(prev => new Set(prev).add(award.id));
      setTimeout(() => {
        setSavedPointsRecently(prev => {
          const next = new Set(prev);
          next.delete(award.id);
          return next;
        });
      }, 2000);
      
      toast.success(`Points updated for ${award.name}`);
    } catch (err) {
      console.error('Error saving points:', err);
      toast.error('Failed to save points');
    } finally {
      setSavingPoints(null);
    }
  };

  const updatePointsValue = (awardId: string, value: number) => {
    const newPointsValues = new Map(pointsValues);
    newPointsValues.set(awardId, value);
    setPointsValues(newPointsValues);
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
        <CardTitle className="flex items-center gap-2">
          <Trophy className="w-5 h-5" />
          Global Boost Awards
        </CardTitle>
        <CardDescription>
          Configure points and set results for standard boost awards
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="settings" className="space-y-4">
          <TabsList>
            <TabsTrigger value="settings" className="flex items-center gap-2">
              <Settings className="w-4 h-4" />
              Settings
            </TabsTrigger>
            <TabsTrigger value="results" className="flex items-center gap-2">
              <Trophy className="w-4 h-4" />
              Results
            </TabsTrigger>
          </TabsList>

          {/* Settings Tab - Points Configuration */}
          <TabsContent value="settings" className="space-y-4">
            <div className="text-sm text-muted-foreground mb-4">
              Configure how many points each boost award is worth
            </div>
            {awards.map((award) => {
              const currentPoints = pointsValues.get(award.id) ?? award.points_value;
              const isSaving = savingPoints === award.id;
              const isSavedRecently = savedPointsRecently.has(award.id);
              const hasChanged = currentPoints !== award.points_value;

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
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        min={1}
                        max={100}
                        value={currentPoints}
                        onChange={(e) => updatePointsValue(award.id, parseInt(e.target.value) || 5)}
                        className="w-20 text-center"
                      />
                      <span className="text-sm text-muted-foreground">pts</span>
                    </div>

                    <Button
                      size="sm"
                      disabled={isSaving || !hasChanged}
                      onClick={() => handleSavePoints(award)}
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
          </TabsContent>

          {/* Results Tab */}
          <TabsContent value="results" className="space-y-4">
            <div className="flex items-center justify-between mb-4">
              <div className="text-sm text-muted-foreground">
                Set the final results. Players who predicted correctly will earn the configured points.
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

            {awards.map((award) => {
              const formValue = formValues.get(award.id) || { teamCode: '', playerName: '' };
              const existingResult = results.get(award.id);
              const isSaving = saving === award.id;
              const isSavedRecently = savedRecently.has(award.id);
              
              const hasChanged = award.prediction_type === 'team'
                ? formValue.teamCode !== (existingResult?.result_team_code || '')
                : formValue.playerName !== (existingResult?.result_player_name || '');

              const hasResult = existingResult && (existingResult.result_team_code || existingResult.result_player_name);
              const isResettingThis = resettingAward === award.id;
              const currentPoints = pointsValues.get(award.id) ?? award.points_value;

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
                      <span className="text-xs text-primary bg-primary/10 px-2 py-0.5 rounded font-medium">
                        {currentPoints} pts
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
                      <Select disabled>
                        <SelectTrigger className="w-[200px]">
                          <SelectValue placeholder="WC2026 player list not yet finalised" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="placeholder" disabled>No players available</SelectItem>
                        </SelectContent>
                      </Select>
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

                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={!hasResult || isResettingThis}
                          className="text-muted-foreground hover:text-destructive"
                        >
                          {isResettingThis ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <RotateCcw className="w-4 h-4" />
                          )}
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Reset "{award.name}" Result?</AlertDialogTitle>
                          <AlertDialogDescription>
                            This will delete the result for this boost award. Users will no longer see scoring for this prediction.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction 
                            onClick={() => handleResetAward(award)} 
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          >
                            Reset
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
              );
            })}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
};
