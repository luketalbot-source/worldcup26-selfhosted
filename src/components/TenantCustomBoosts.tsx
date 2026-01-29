import { useState, useEffect, useMemo } from 'react';
import { Plus, Loader2, Trash2, Image, Save, Check, RotateCcw, RefreshCw } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
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

interface CustomBoost {
  id: string;
  tenant_id: string;
  title: string;
  description: string | null;
  points_value: number;
  prediction_type: 'team' | 'player';
  image_url: string | null;
  display_order: number;
  lock_date: string | null;
  original_language: string | null;
  created_at: string;
}

interface CustomBoostResult {
  id?: string;
  custom_boost_id: string;
  result_team_code: string | null;
  result_player_name: string | null;
}

interface TenantCustomBoostsProps {
  tenantId: string;
  tenantName: string;
}

// Get unique teams by code
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

export const TenantCustomBoosts = ({ tenantId, tenantName }: TenantCustomBoostsProps) => {
  const [boosts, setBoosts] = useState<CustomBoost[]>([]);
  const [results, setResults] = useState<Map<string, CustomBoostResult>>(new Map());
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [generatingImage, setGeneratingImage] = useState<string | null>(null);
  const [savingResult, setSavingResult] = useState<string | null>(null);
  const [resettingResult, setResettingResult] = useState<string | null>(null);
  
  // Form state
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [pointsValue, setPointsValue] = useState('5');
  const [predictionType, setPredictionType] = useState<'team' | 'player'>('team');
  
  // Result form state
  const [resultValues, setResultValues] = useState<Map<string, { teamCode: string; playerName: string }>>(new Map());

  const uniqueTeams = useMemo(() => getUniqueTeams(), []);

  useEffect(() => {
    fetchData();
  }, [tenantId]);

  const fetchData = async () => {
    setLoading(true);
    try {
      // Fetch custom boosts for this tenant
      const { data: boostsData, error: boostsError } = await supabase
        .from('tenant_custom_boosts')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('display_order');

      if (boostsError) throw boostsError;
      setBoosts((boostsData || []) as CustomBoost[]);

      // Fetch results
      if (boostsData && boostsData.length > 0) {
        const boostIds = boostsData.map(b => b.id);
        const { data: resultsData, error: resultsError } = await supabase
          .from('tenant_custom_boost_results')
          .select('*')
          .in('custom_boost_id', boostIds);

        if (resultsError) throw resultsError;

        const resultsMap = new Map<string, CustomBoostResult>();
        const formMap = new Map<string, { teamCode: string; playerName: string }>();
        
        (resultsData || []).forEach((r: CustomBoostResult) => {
          resultsMap.set(r.custom_boost_id, r);
          formMap.set(r.custom_boost_id, {
            teamCode: r.result_team_code || '',
            playerName: r.result_player_name || '',
          });
        });
        
        setResults(resultsMap);
        setResultValues(formMap);
      }
    } catch (err) {
      console.error('Error fetching custom boosts:', err);
      toast.error('Failed to load custom boosts');
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async () => {
    if (!title.trim()) {
      toast.error('Title is required');
      return;
    }

    setCreating(true);
    try {
      // First, detect language and prepare translations
      const { data: boost, error } = await supabase
        .from('tenant_custom_boosts')
        .insert({
          tenant_id: tenantId,
          title: title.trim(),
          description: description.trim() || null,
          points_value: parseInt(pointsValue) || 5,
          prediction_type: predictionType,
          display_order: boosts.length,
          original_language: 'en', // Will be updated by AI
        })
        .select()
        .single();

      if (error) throw error;

      setBoosts([...boosts, boost as CustomBoost]);
      
      // Reset form
      setTitle('');
      setDescription('');
      setPointsValue('5');
      setPredictionType('team');
      setDialogOpen(false);
      
      toast.success('Custom boost created!');
      
      // Generate image in background
      generateImage(boost.id, boost.title, boost.description);
    } catch (err) {
      console.error('Error creating custom boost:', err);
      toast.error('Failed to create custom boost');
    } finally {
      setCreating(false);
    }
  };

  const generateImage = async (boostId: string, boostTitle: string, boostDescription: string | null) => {
    setGeneratingImage(boostId);
    try {
      const response = await supabase.functions.invoke('generate-boost-image', {
        body: { 
          boostId,
          title: boostTitle,
          description: boostDescription 
        },
      });

      if (response.error) throw response.error;

      // Update local state with the new image URL
      if (response.data?.imageUrl) {
        setBoosts(prev => prev.map(b => 
          b.id === boostId ? { ...b, image_url: response.data.imageUrl } : b
        ));
        toast.success('Image generated!');
      }
    } catch (err) {
      console.error('Error generating image:', err);
      toast.error('Failed to generate image');
    } finally {
      setGeneratingImage(null);
    }
  };

  const handleDelete = async (boostId: string) => {
    try {
      const { error } = await supabase
        .from('tenant_custom_boosts')
        .delete()
        .eq('id', boostId);

      if (error) throw error;

      setBoosts(boosts.filter(b => b.id !== boostId));
      toast.success('Custom boost deleted');
    } catch (err) {
      console.error('Error deleting custom boost:', err);
      toast.error('Failed to delete custom boost');
    }
  };

  const handleSaveResult = async (boost: CustomBoost) => {
    setSavingResult(boost.id);
    
    const formValue = resultValues.get(boost.id) || { teamCode: '', playerName: '' };
    
    try {
      const { error } = await supabase
        .from('tenant_custom_boost_results')
        .upsert({
          custom_boost_id: boost.id,
          result_team_code: boost.prediction_type === 'team' ? formValue.teamCode || null : null,
          result_player_name: boost.prediction_type === 'player' ? formValue.playerName || null : null,
        }, {
          onConflict: 'custom_boost_id',
        });

      if (error) throw error;

      // Update local state
      const newResults = new Map(results);
      newResults.set(boost.id, {
        custom_boost_id: boost.id,
        result_team_code: boost.prediction_type === 'team' ? formValue.teamCode : null,
        result_player_name: boost.prediction_type === 'player' ? formValue.playerName : null,
      });
      setResults(newResults);
      
      toast.success(`Result saved for ${boost.title}`);
    } catch (err) {
      console.error('Error saving result:', err);
      toast.error('Failed to save result');
    } finally {
      setSavingResult(null);
    }
  };

  const handleResetResult = async (boost: CustomBoost) => {
    setResettingResult(boost.id);
    try {
      const { error } = await supabase
        .from('tenant_custom_boost_results')
        .delete()
        .eq('custom_boost_id', boost.id);

      if (error) throw error;

      const newResults = new Map(results);
      newResults.delete(boost.id);
      setResults(newResults);

      const newFormValues = new Map(resultValues);
      newFormValues.delete(boost.id);
      setResultValues(newFormValues);
      
      toast.success(`Result reset for ${boost.title}`);
    } catch (err) {
      console.error('Error resetting result:', err);
      toast.error('Failed to reset result');
    } finally {
      setResettingResult(null);
    }
  };

  const updateResultValue = (boostId: string, field: 'teamCode' | 'playerName', value: string) => {
    const newFormValues = new Map(resultValues);
    const current = newFormValues.get(boostId) || { teamCode: '', playerName: '' };
    newFormValues.set(boostId, { ...current, [field]: value });
    setResultValues(newFormValues);
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
              Custom Boosts
              <Badge variant="secondary">{boosts.length}</Badge>
            </CardTitle>
            <CardDescription>
              Create custom boost awards specific to {tenantName}. Each will appear with a "Custom" badge.
            </CardDescription>
          </div>
          
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="w-4 h-4 mr-2" />
                Add Boost
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create Custom Boost</DialogTitle>
                <DialogDescription>
                  Create a new boost award for this tenant. An image will be auto-generated based on the description.
                </DialogDescription>
              </DialogHeader>
              
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="title">Title</Label>
                  <Input
                    id="title"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="e.g., Top Scorer Prediction"
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="description">Description</Label>
                  <Textarea
                    id="description"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="e.g., Predict which team will score the most goals in the group stage"
                    rows={3}
                  />
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="points">Points Value</Label>
                    <Input
                      id="points"
                      type="number"
                      value={pointsValue}
                      onChange={(e) => setPointsValue(e.target.value)}
                      min={1}
                      max={100}
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="type">Prediction Type</Label>
                    <Select value={predictionType} onValueChange={(v) => setPredictionType(v as 'team' | 'player')}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="team">Team</SelectItem>
                        <SelectItem value="player">Player</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
              
              <DialogFooter>
                <Button variant="outline" onClick={() => setDialogOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={handleCreate} disabled={creating || !title.trim()}>
                  {creating ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    'Create Boost'
                  )}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      
      <CardContent className="space-y-4">
        {boosts.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            No custom boosts yet. Create one to get started!
          </div>
        ) : (
          boosts.map((boost) => {
            const formValue = resultValues.get(boost.id) || { teamCode: '', playerName: '' };
            const existingResult = results.get(boost.id);
            const isSaving = savingResult === boost.id;
            const isResetting = resettingResult === boost.id;
            const isGenerating = generatingImage === boost.id;
            
            const hasChanged = boost.prediction_type === 'team'
              ? formValue.teamCode !== (existingResult?.result_team_code || '')
              : formValue.playerName !== (existingResult?.result_player_name || '');

            const hasResult = existingResult && (existingResult.result_team_code || existingResult.result_player_name);

            return (
              <div
                key={boost.id}
                className="flex items-start gap-4 p-4 border rounded-lg"
              >
                {/* Image preview with regenerate button */}
                <div className="relative w-20 h-20 flex-shrink-0 bg-muted rounded-lg overflow-hidden group">
                  {isGenerating ? (
                    <div className="w-full h-full flex items-center justify-center">
                      <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                    </div>
                  ) : boost.image_url ? (
                    <>
                      <img 
                        src={boost.image_url} 
                        alt={boost.title}
                        className="w-full h-full object-cover"
                      />
                      <button
                        onClick={() => generateImage(boost.id, boost.title, boost.description)}
                        className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                        title="Regenerate image"
                      >
                        <RefreshCw className="w-5 h-5 text-white" />
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => generateImage(boost.id, boost.title, boost.description)}
                      className="w-full h-full flex flex-col items-center justify-center hover:bg-muted/80 transition-colors"
                      title="Generate image"
                    >
                      <Image className="w-5 h-5 text-muted-foreground" />
                      <span className="text-[10px] text-muted-foreground mt-1">Generate</span>
                    </button>
                  )}
                </div>
                
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h4 className="font-medium">{boost.title}</h4>
                    <Badge variant="outline" className="text-xs">
                      {boost.prediction_type === 'team' ? 'Team' : 'Player'}
                    </Badge>
                    <Badge variant="secondary" className="text-xs">
                      {boost.points_value} pts
                    </Badge>
                  </div>
                  {boost.description && (
                    <p className="text-sm text-muted-foreground mb-3">{boost.description}</p>
                  )}
                  
                  {/* Result controls */}
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">Result:</span>
                    {boost.prediction_type === 'team' ? (
                      <Select
                        value={formValue.teamCode}
                        onValueChange={(value) => updateResultValue(boost.id, 'teamCode', value)}
                      >
                        <SelectTrigger className="w-[180px] h-8 text-sm">
                          <SelectValue placeholder="Set winner..." />
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
                        <SelectTrigger className="w-[180px] h-8 text-sm">
                          <SelectValue placeholder="Player list not ready" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="placeholder" disabled>Not available</SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                    
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={isSaving || !hasChanged}
                      onClick={() => handleSaveResult(boost)}
                      className="h-8"
                    >
                      {isSaving ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <Save className="w-3 h-3" />
                      )}
                    </Button>
                    
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={!hasResult || isResetting}
                      onClick={() => handleResetResult(boost)}
                      className="h-8 text-muted-foreground hover:text-destructive"
                    >
                      {isResetting ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <RotateCcw className="w-3 h-3" />
                      )}
                    </Button>
                  </div>
                </div>
                
                {/* Actions */}
                <div className="flex items-start gap-2">
                  {!boost.image_url && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => generateImage(boost.id, boost.title, boost.description)}
                      disabled={isGenerating}
                    >
                      {isGenerating ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Image className="w-4 h-4" />
                      )}
                    </Button>
                  )}
                  
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button size="sm" variant="outline" className="text-destructive hover:text-destructive">
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete "{boost.title}"?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This will permanently delete this custom boost and all related predictions. This action cannot be undone.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction 
                          onClick={() => handleDelete(boost.id)}
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                          Delete
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
};
