import { useState, useEffect, useMemo } from 'react';
import { Loader2, Trophy, Save, Check, RotateCcw, Settings } from 'lucide-react';
import { api } from '@/lib/apiClient';
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
import { useTeams } from '@/hooks/useTeams';
import { PlayerPicker } from '@/components/PlayerPicker';
import { Flag } from '@/components/Flag';

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

interface CompetitionRow {
  slug: string;
  name: string;
  short_name: string;
  season: string;
  format: 'tournament' | 'league' | 'hybrid';
  is_active: boolean;
  display_order: number;
}

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

  // Competition selector: awards, teams and players are all per-competition
  // now. The admin renders outside a CompetitionProvider, so we fetch the
  // full registry here and scope every fetch to the chosen game.
  const [competitions, setCompetitions] = useState<CompetitionRow[]>([]);
  const [selectedSlug, setSelectedSlug] = useState<string>('');
  const selectedComp = competitions.find((c) => c.slug === selectedSlug) ?? null;
  // Clubs (league/hybrid) render crests; the WC tournament renders flags.
  const teamKind: 'country' | 'club' = selectedComp && selectedComp.format !== 'tournament' ? 'club' : 'country';

  // Roster for the selected competition (crest_url carries club badges).
  const { teams: rosterTeams } = useTeams(selectedSlug || undefined);
  const uniqueTeams = useMemo(
    () =>
      rosterTeams
        .filter((t) => t.tla && t.tla !== 'TBD' && t.tla !== '???')
        .map((t) => ({ id: t.id, code: t.tla, name: t.name, crestUrl: t.crest_url }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [rosterTeams],
  );

  const fetchData = async (slug: string) => {
    setLoading(true);
    try {
      const [awardsData, resultsData] = await Promise.all([
        api.get<BoostAward[]>(`/boosts/awards?competition=${encodeURIComponent(slug)}`),
        api.get<BoostResult[]>('/boosts/results'),
      ]);

      setAwards(awardsData || []);

      // Initialize points values
      const pointsMap = new Map<string, number>();
      (awardsData || []).forEach((a: BoostAward) => {
        pointsMap.set(a.id, a.points_value);
      });
      setPointsValues(pointsMap);

      // Convert results to map
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

  // Fetch the competition registry once; default the selector to the first game.
  useEffect(() => {
    let cancelled = false;
    api
      .get<CompetitionRow[]>('/competitions')
      .then((rows) => {
        if (cancelled) return;
        const sorted = [...rows].sort((a, b) => a.display_order - b.display_order);
        setCompetitions(sorted);
        setSelectedSlug((prev) => prev || sorted[0]?.slug || '');
      })
      .catch((err) => {
        console.error('Error fetching competitions:', err);
        toast.error('Failed to load competitions');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // (Re)load awards + results whenever the selected competition changes.
  useEffect(() => {
    if (selectedSlug) fetchData(selectedSlug);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSlug]);

  const handleSave = async (award: BoostAward) => {
    setSaving(award.id);

    const formValue = formValues.get(award.id) || { teamCode: '', playerName: '' };

    try {
      await api.post('/boosts/results', {
        award_id: award.id,
        result_team_code: award.prediction_type === 'team' ? formValue.teamCode || null : null,
        result_player_name: award.prediction_type === 'player' ? formValue.playerName || null : null,
      });

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
      // Scoped to the selected competition: the bulk DELETE /boosts/results
      // endpoint wipes EVERY competition's results, so reset only the awards
      // shown here by deleting each one.
      await Promise.all(awards.map((a) => api.delete(`/boosts/results/${a.id}`).catch(() => {})));

      // Clear local state for this competition's awards only
      const awardIds = new Set(awards.map((a) => a.id));
      setResults((prev) => new Map([...prev].filter(([id]) => !awardIds.has(id))));
      setFormValues((prev) => new Map([...prev].filter(([id]) => !awardIds.has(id))));

      toast.success('Boost results reset for this competition');
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
      await api.delete(`/boosts/results/${award.id}`);

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

  // Team results support multiple winners (comma-separated) so a tie — e.g. two
  // teams sharing the most goals — can be recorded and anyone who picked either
  // one scores. Codes are stored as a clean "ENG,FRA" CSV.
  const getTeamCodes = (awardId: string): string[] =>
    (formValues.get(awardId)?.teamCode || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

  const addTeamWinner = (awardId: string, code: string) => {
    const current = getTeamCodes(awardId);
    if (current.includes(code)) return;
    updateFormValue(awardId, 'teamCode', [...current, code].join(','));
  };

  const removeTeamWinner = (awardId: string, code: string) => {
    updateFormValue(awardId, 'teamCode', getTeamCodes(awardId).filter((c) => c !== code).join(','));
  };

  const handleSavePoints = async (award: BoostAward) => {
    setSavingPoints(award.id);
    const newPoints = pointsValues.get(award.id) ?? award.points_value;

    try {
      await api.patch(`/boosts/awards/${award.id}`, { points_value: newPoints });

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
    const team = uniqueTeams.find((t) => t.code === code);
    if (!team) return code;
    return (
      <span className="inline-flex items-center gap-1.5">
        <Flag code={team.code} crestUrl={team.crestUrl} kind={teamKind} className="w-4" />
        <span>{team.name}</span>
      </span>
    );
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
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Trophy className="w-5 h-5" />
              Boost Awards
            </CardTitle>
            <CardDescription>
              Configure points and set results, per competition
            </CardDescription>
          </div>
          <div className="w-[240px] max-w-full">
            <Select value={selectedSlug} onValueChange={setSelectedSlug}>
              <SelectTrigger aria-label="Competition">
                <SelectValue placeholder="Select competition…" />
              </SelectTrigger>
              <SelectContent>
                {competitions.map((comp) => (
                  <SelectItem key={comp.slug} value={comp.slug}>
                    {comp.short_name} {comp.season}
                    {!comp.is_active ? ' (archived)' : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
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
                      <div className="flex flex-col gap-1.5 w-[220px]">
                        {getTeamCodes(award.id).length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {getTeamCodes(award.id).map((code) => (
                              <span
                                key={code}
                                className="inline-flex items-center gap-1 bg-muted rounded px-2 py-0.5 text-xs"
                              >
                                {getTeamDisplay(code)}
                                <button
                                  type="button"
                                  onClick={() => removeTeamWinner(award.id, code)}
                                  className="ml-0.5 text-muted-foreground hover:text-destructive leading-none"
                                  aria-label={`Remove ${code}`}
                                >
                                  ×
                                </button>
                              </span>
                            ))}
                          </div>
                        )}
                        <Select value="" onValueChange={(value) => addTeamWinner(award.id, value)}>
                          <SelectTrigger className="w-full">
                            <SelectValue
                              placeholder={getTeamCodes(award.id).length ? 'Add tied team…' : 'Select winner…'}
                            />
                          </SelectTrigger>
                          <SelectContent>
                            {uniqueTeams
                              .filter((team) => !getTeamCodes(award.id).includes(team.code))
                              .map((team) => (
                                <SelectItem key={team.id} value={team.code}>
                                  <span className="inline-flex items-center gap-1.5">
                                    <Flag code={team.code} crestUrl={team.crestUrl} kind={teamKind} className="w-4" />
                                    <span>{team.name}</span>
                                  </span>
                                </SelectItem>
                              ))}
                          </SelectContent>
                        </Select>
                      </div>
                    ) : (
                      <div className="w-[200px]">
                        <PlayerPicker
                          value={formValue.playerName}
                          onChange={(name) => updateFormValue(award.id, 'playerName', name)}
                          placeholder="Select winner…"
                          competitionSlug={selectedSlug}
                        />
                      </div>
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
