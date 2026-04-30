import { useState, useEffect, useMemo } from 'react';
import { Loader2, Lock, Unlock, Save, Calendar, Filter, X, Plus } from 'lucide-react';
import { api } from '@/lib/apiClient';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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
} from '@/components/ui/alert-dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';

interface AdminGoal {
  id: string;
  minute: number;
  player_name: string;
  team_side: 'home' | 'away';
}

// Mirrors the live_matches schema. Stays loose on Match `stage` to tolerate
// any new value the football-data.org sync might introduce in the future
// (e.g. RELEGATION_PLAYOFF — won't happen at WC but good defence).
interface AdminMatch {
  match_id: string;
  api_match_id: number | null;
  home_team_name: string;
  home_team_code: string;
  away_team_name: string;
  away_team_code: string;
  home_score: number | null;
  away_score: number | null;
  match_date: string;
  venue: string | null;
  city: string | null;
  stage: string;
  group_name: string | null;
  status: string;
  manual_override: boolean;
  last_updated: string;
  goals?: AdminGoal[];
}

// FD's status enum, paired with a one-line plain-English gloss so admins
// don't have to remember what "TIMED" vs "SCHEDULED" means at 02:00 during
// a live match. The raw enum value is what we send to the API; the gloss
// is purely cosmetic (rendered alongside the value in the dropdown).
const STATUS_OPTIONS: Array<{ value: string; gloss: string }> = [
  { value: 'SCHEDULED', gloss: 'fixture exists, kick-off time not yet confirmed' },
  { value: 'TIMED',     gloss: 'kick-off confirmed, not yet started' },
  { value: 'IN_PLAY',   gloss: 'match is live' },
  { value: 'PAUSED',    gloss: 'half-time / VAR / in-game break' },
  { value: 'FINISHED',  gloss: 'full-time, final score recorded' },
  { value: 'POSTPONED', gloss: 'deferred to a later date' },
  { value: 'CANCELLED', gloss: 'called off, no replay' },
  { value: 'SUSPENDED', gloss: 'abandoned mid-game' },
];

type FilterMode = 'all' | 'today' | 'live' | 'overridden';

const STAGE_LABEL: Record<string, string> = {
  group: 'Group Stage',
  round32: 'Round of 32',
  round16: 'Round of 16',
  quarter: 'Quarter-finals',
  semi: 'Semi-finals',
  third: 'Third-place play-off',
  final: 'Final',
};

const STAGE_ORDER = ['group', 'round32', 'round16', 'quarter', 'semi', 'third', 'final'];

/**
 * Convert the API's UTC ISO match_date into the value an
 * `<input type="datetime-local">` accepts (YYYY-MM-DDTHH:mm) in the user's
 * local timezone. The native picker can't read raw ISO strings.
 */
function isoToLocalInput(iso: string): string {
  const d = new Date(iso);
  // Pad helpers
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

function localInputToIso(local: string): string {
  // datetime-local has no TZ; treat as user's local TZ and convert to UTC ISO.
  return new Date(local).toISOString();
}

function formatKickoff(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

const isToday = (iso: string) => {
  const d = new Date(iso);
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
};

const isLive = (status: string) =>
  status === 'IN_PLAY' || status === 'PAUSED' || status === 'LIVE';

export const AdminMatchesEditor = () => {
  const [matches, setMatches] = useState<AdminMatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterMode>('all');
  const [editing, setEditing] = useState<AdminMatch | null>(null);
  const [draft, setDraft] = useState<Partial<AdminMatch> | null>(null);
  const [saving, setSaving] = useState(false);
  // Two-phase release: click "Release" → confirm modal → release + sync.
  // Holding the candidate match here decouples confirm UI from the editor
  // dialog so we can close the editor before the confirm appears.
  const [confirmRelease, setConfirmRelease] = useState<AdminMatch | null>(null);
  const [releasing, setReleasing] = useState(false);
  // New-goal form state. Persists across goal additions so the admin can
  // hammer Enter to add several goals in a row without re-picking side.
  const [goalDraft, setGoalDraft] = useState<{
    minute: string;
    player_name: string;
    team_side: 'home' | 'away';
  }>({ minute: '', player_name: '', team_side: 'home' });

  const fetchMatches = async () => {
    setLoading(true);
    try {
      const data = await api.get<AdminMatch[]>('/admin/matches');
      setMatches(data ?? []);
    } catch (err) {
      toast.error('Failed to load matches');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void fetchMatches(); }, []);

  const filtered = useMemo(() => {
    return matches.filter((m) => {
      if (filter === 'today') return isToday(m.match_date);
      if (filter === 'live') return isLive(m.status);
      if (filter === 'overridden') return m.manual_override;
      return true;
    });
  }, [matches, filter]);

  // Group by stage → group_name (or 'Knockout' for non-group stages).
  const grouped = useMemo(() => {
    const out: Record<string, Record<string, AdminMatch[]>> = {};
    for (const m of filtered) {
      const stage = m.stage in STAGE_LABEL ? m.stage : m.stage;
      const subkey = m.stage === 'group' ? (m.group_name || '?') : '_';
      (out[stage] ??= {});
      (out[stage]![subkey] ??= []).push(m);
    }
    // Sort each list chronologically.
    for (const stage of Object.keys(out)) {
      for (const sub of Object.keys(out[stage]!)) {
        out[stage]![sub]!.sort(
          (a, b) => new Date(a.match_date).getTime() - new Date(b.match_date).getTime()
        );
      }
    }
    return out;
  }, [filtered]);

  const openEdit = (match: AdminMatch) => {
    setEditing(match);
    setDraft({ ...match });
  };

  const closeEdit = () => {
    setEditing(null);
    setDraft(null);
  };

  // Build the patch body — only include fields the admin actually changed,
  // so a no-op save still toggles manual_override without rewriting unrelated
  // columns.
  const buildPatch = (): Record<string, unknown> => {
    if (!editing || !draft) return {};
    const patch: Record<string, unknown> = {};
    const keys: (keyof AdminMatch)[] = [
      'home_team_name', 'home_team_code', 'away_team_name', 'away_team_code',
      'home_score', 'away_score', 'match_date', 'venue', 'city',
      'stage', 'group_name', 'status',
    ];
    for (const k of keys) {
      if (draft[k] !== editing[k]) patch[k] = draft[k];
    }
    return patch;
  };

  const handleSave = async () => {
    if (!editing) return;
    setSaving(true);
    try {
      const body = buildPatch();
      const updated = await api.patch<AdminMatch>(`/admin/matches/${encodeURIComponent(editing.match_id)}`, body);
      setMatches((rows) => rows.map((r) => (r.match_id === updated.match_id ? updated : r)));
      toast.success('Match updated — sync will skip this row');
      closeEdit();
    } catch (err) {
      toast.error('Failed to save match');
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  // Release flow: clear the manual_override flag, then immediately trigger a
  // sync from football-data.org and refetch — so the row's manual values
  // visibly revert to FD's data while the user is watching, instead of the
  // release feeling like a no-op until some future scheduled sync runs.
  const performRelease = async (match: AdminMatch) => {
    setReleasing(true);
    const toastId = `release-${match.match_id}`;
    try {
      await api.delete<AdminMatch>(`/admin/matches/${encodeURIComponent(match.match_id)}/override`);
      closeEdit();
      setConfirmRelease(null);

      toast.loading(
        `Releasing ${match.home_team_code} vs ${match.away_team_code} — syncing from football-data.org…`,
        { id: toastId },
      );

      // Fire sync. If one is already running this returns 202 with the
      // existing job state — same outcome from our perspective.
      try {
        await api.post('/admin/sync-matches', {});
      } catch (err) {
        // Non-fatal: the override is already cleared. Surface but don't abort.
        console.warn('[release] sync-matches kick failed:', err);
      }

      // Poll sync-status until idle (or 30s timeout). 1.5s cadence avoids
      // hammering the API while keeping the toast feeling responsive.
      const start = Date.now();
      while (Date.now() - start < 30_000) {
        await new Promise((r) => setTimeout(r, 1500));
        try {
          const status = await api.get<{ status: string }>('/admin/sync-status');
          if (status?.status !== 'running') break;
        } catch {
          break;
        }
      }

      await fetchMatches();
      toast.success(
        `${match.home_team_code} vs ${match.away_team_code} released — values reverted to football-data.org`,
        { id: toastId, duration: 5000 },
      );
    } catch (err) {
      toast.error('Failed to release override', { id: toastId });
      console.error(err);
    } finally {
      setReleasing(false);
    }
  };

  const updateDraft = <K extends keyof AdminMatch>(k: K, v: AdminMatch[K] | null) => {
    setDraft((d) => (d ? { ...d, [k]: v } : d));
  };

  // Add / remove goal scorers. Updates BOTH the local editing dialog state
  // and the parent matches list so the row's goal count + the goals array
  // stay in sync without a refetch round-trip.
  const addGoal = async () => {
    if (!editing) return;
    const minute = parseInt(goalDraft.minute, 10);
    if (!minute || minute < 1 || minute > 130) {
      toast.error('Minute must be between 1 and 130');
      return;
    }
    if (!goalDraft.player_name.trim()) {
      toast.error('Player name required');
      return;
    }
    try {
      const newGoal = await api.post<AdminGoal>(
        `/admin/matches/${encodeURIComponent(editing.match_id)}/goals`,
        {
          minute,
          player_name: goalDraft.player_name.trim(),
          team_side: goalDraft.team_side,
        },
      );
      const updatedGoals: AdminGoal[] = [...(editing.goals ?? []), newGoal].sort(
        (a, b) => a.minute - b.minute,
      );
      setEditing({ ...editing, goals: updatedGoals });
      setMatches((rows) =>
        rows.map((r) => (r.match_id === editing.match_id ? { ...r, goals: updatedGoals } : r)),
      );
      // Reset the form but keep team_side selected — admin often enters
      // multiple goals for the same side back-to-back.
      setGoalDraft({ minute: '', player_name: '', team_side: goalDraft.team_side });
    } catch (err) {
      toast.error('Failed to add goal');
      console.error(err);
    }
  };

  const removeGoal = async (goalId: string) => {
    if (!editing) return;
    try {
      await api.delete(
        `/admin/matches/${encodeURIComponent(editing.match_id)}/goals/${goalId}`,
      );
      const filtered = (editing.goals ?? []).filter((g) => g.id !== goalId);
      setEditing({ ...editing, goals: filtered });
      setMatches((rows) =>
        rows.map((r) => (r.match_id === editing.match_id ? { ...r, goals: filtered } : r)),
      );
    } catch (err) {
      toast.error('Failed to remove goal');
      console.error(err);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="py-12 flex justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  const filterChips: Array<{ key: FilterMode; label: string; count: number }> = [
    { key: 'all',        label: 'All',        count: matches.length },
    { key: 'today',      label: 'Today',      count: matches.filter((m) => isToday(m.match_date)).length },
    { key: 'live',       label: 'In play',    count: matches.filter((m) => isLive(m.status)).length },
    { key: 'overridden', label: 'Overridden', count: matches.filter((m) => m.manual_override).length },
  ];

  const orderedStages = STAGE_ORDER.filter((s) => grouped[s])
    .concat(Object.keys(grouped).filter((s) => !STAGE_ORDER.includes(s)));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Calendar className="w-5 h-5" />
          Match Editor
        </CardTitle>
        <CardDescription>
          Override scores, kick-off times, statuses, and team names. Edited rows
          are locked from automatic sync until released.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Filter chips */}
        <div className="flex items-center gap-2 flex-wrap">
          <Filter className="w-4 h-4 text-muted-foreground" />
          {filterChips.map((c) => (
            <Button
              key={c.key}
              variant={filter === c.key ? 'default' : 'outline'}
              size="sm"
              onClick={() => setFilter(c.key)}
            >
              {c.label}
              <span className="ml-1.5 text-xs opacity-70">{c.count}</span>
            </Button>
          ))}
        </div>

        {filtered.length === 0 && (
          <div className="text-center py-8 text-sm text-muted-foreground">
            No matches in this view.
          </div>
        )}

        {orderedStages.map((stage) => {
          const subgroups = grouped[stage]!;
          const isGroup = stage === 'group';
          const subKeys = Object.keys(subgroups).sort();
          return (
            <div key={stage} className="space-y-2">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                {STAGE_LABEL[stage] ?? stage}
              </h3>
              {subKeys.map((sub) => (
                <div key={sub} className="space-y-1">
                  {isGroup && (
                    <h4 className="text-xs font-medium text-muted-foreground pl-1">
                      Group {sub}
                    </h4>
                  )}
                  {subgroups[sub]!.map((m) => (
                    <button
                      key={m.match_id}
                      onClick={() => openEdit(m)}
                      className="w-full text-left border border-border rounded-lg p-3 hover:bg-muted/50 transition-colors flex items-center gap-3"
                    >
                      <span className="text-xs text-muted-foreground w-32 shrink-0">
                        {formatKickoff(m.match_date)}
                      </span>
                      <span className="flex-1 flex items-center gap-2 font-medium">
                        <span className="text-right flex-1">{m.home_team_code}</span>
                        <span className="font-mono px-2 py-0.5 rounded bg-muted text-sm">
                          {m.home_score ?? '–'} : {m.away_score ?? '–'}
                        </span>
                        <span className="flex-1">{m.away_team_code}</span>
                      </span>
                      <Badge variant={isLive(m.status) ? 'destructive' : m.status === 'FINISHED' ? 'default' : 'secondary'}>
                        {m.status}
                      </Badge>
                      {m.manual_override && (
                        <Lock className="w-4 h-4 text-amber-500" aria-label="Manually overridden" />
                      )}
                    </button>
                  ))}
                </div>
              ))}
            </div>
          );
        })}
      </CardContent>

      {/* Edit dialog */}
      <Dialog open={!!editing} onOpenChange={(open) => { if (!open) closeEdit(); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              Edit {editing?.home_team_code} vs {editing?.away_team_code}
            </DialogTitle>
            <DialogDescription>
              Saving will lock this match from automatic sync. Use "Release to sync"
              to allow football-data.org to update it again.
            </DialogDescription>
          </DialogHeader>

          {draft && editing && (
            <div className="space-y-4 py-2">
              {/* Kickoff */}
              <div className="space-y-1.5">
                <Label htmlFor="match_date">Kickoff</Label>
                <Input
                  id="match_date"
                  type="datetime-local"
                  value={isoToLocalInput(draft.match_date ?? editing.match_date)}
                  onChange={(e) => updateDraft('match_date', localInputToIso(e.target.value))}
                />
                <p className="text-xs text-muted-foreground">
                  Shown in <strong>your local time zone</strong> ({Intl.DateTimeFormat().resolvedOptions().timeZone}),
                  not the venue's. Stored as UTC and displayed to each user in their own time zone.
                </p>
              </div>

              {/* Teams */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Home team name</Label>
                  <Input
                    value={draft.home_team_name ?? ''}
                    onChange={(e) => updateDraft('home_team_name', e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Code</Label>
                  <Input
                    maxLength={4}
                    value={draft.home_team_code ?? ''}
                    onChange={(e) => updateDraft('home_team_code', e.target.value.toUpperCase())}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Away team name</Label>
                  <Input
                    value={draft.away_team_name ?? ''}
                    onChange={(e) => updateDraft('away_team_name', e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Code</Label>
                  <Input
                    maxLength={4}
                    value={draft.away_team_code ?? ''}
                    onChange={(e) => updateDraft('away_team_code', e.target.value.toUpperCase())}
                  />
                </div>
              </div>

              {/* Scores */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Home score</Label>
                  <Input
                    type="number"
                    min={0}
                    placeholder="(not played)"
                    value={draft.home_score ?? ''}
                    onChange={(e) => {
                      const v = e.target.value;
                      updateDraft('home_score', v === '' ? null : Math.max(0, parseInt(v, 10) || 0));
                    }}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Away score</Label>
                  <Input
                    type="number"
                    min={0}
                    placeholder="(not played)"
                    value={draft.away_score ?? ''}
                    onChange={(e) => {
                      const v = e.target.value;
                      updateDraft('away_score', v === '' ? null : Math.max(0, parseInt(v, 10) || 0));
                    }}
                  />
                </div>
              </div>

              {/* Status. SelectValue mirrors only the raw enum (matches the
                  list view's Badge), but each open option shows the friendly
                  gloss so admins don't have to remember the FD vocabulary. */}
              <div className="space-y-1.5">
                <Label>Status</Label>
                <Select
                  value={draft.status ?? 'SCHEDULED'}
                  onValueChange={(v) => updateDraft('status', v)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUS_OPTIONS.map((s) => (
                      <SelectItem key={s.value} value={s.value}>
                        <div className="flex flex-col">
                          <span className="font-medium">{s.value}</span>
                          <span className="text-xs text-muted-foreground">
                            {s.gloss}
                          </span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Venue + city + group */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Venue</Label>
                  <Input
                    value={draft.venue ?? ''}
                    onChange={(e) => updateDraft('venue', e.target.value || null)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>City</Label>
                  <Input
                    value={draft.city ?? ''}
                    onChange={(e) => updateDraft('city', e.target.value || null)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Group</Label>
                  <Input
                    maxLength={2}
                    value={draft.group_name ?? ''}
                    onChange={(e) => updateDraft('group_name', e.target.value.toUpperCase() || null)}
                  />
                </div>
              </div>

              {/* Goal scorers — manual entry since FD doesn't supply event
                  data on this tier. Adds/removes hit the API immediately
                  and emit SSE so user clients update in real time. */}
              <div className="space-y-2 pt-2 border-t">
                <Label>Goal scorers</Label>

                <div className="space-y-1 max-h-44 overflow-y-auto pr-1">
                  {(editing.goals ?? []).length === 0 && (
                    <p className="text-xs text-muted-foreground italic">
                      No goals recorded. Add one below.
                    </p>
                  )}
                  {(editing.goals ?? []).map((g) => (
                    <div
                      key={g.id}
                      className="flex items-center gap-2 text-sm bg-muted/50 rounded px-2 py-1"
                    >
                      <span className="font-mono text-xs w-10 shrink-0 text-muted-foreground">
                        {g.minute}&prime;
                      </span>
                      <span className="flex-1 truncate">{g.player_name}</span>
                      <span className="text-xs font-semibold text-muted-foreground shrink-0 px-1.5 py-0.5 rounded bg-background">
                        {g.team_side === 'home' ? editing.home_team_code : editing.away_team_code}
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0 shrink-0"
                        onClick={() => removeGoal(g.id)}
                        aria-label={`Remove ${g.player_name}`}
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                  ))}
                </div>

                <div className="flex gap-2 items-end">
                  <div className="w-16 space-y-1">
                    <Label className="text-[10px] text-muted-foreground uppercase tracking-wider">Min</Label>
                    <Input
                      type="number"
                      min={1}
                      max={130}
                      placeholder="45"
                      value={goalDraft.minute}
                      onChange={(e) => setGoalDraft({ ...goalDraft, minute: e.target.value })}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          void addGoal();
                        }
                      }}
                    />
                  </div>
                  <div className="flex-1 space-y-1">
                    <Label className="text-[10px] text-muted-foreground uppercase tracking-wider">Player</Label>
                    <Input
                      placeholder="Harry Kane"
                      value={goalDraft.player_name}
                      onChange={(e) => setGoalDraft({ ...goalDraft, player_name: e.target.value })}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          void addGoal();
                        }
                      }}
                    />
                  </div>
                  <div className="w-24 space-y-1">
                    <Label className="text-[10px] text-muted-foreground uppercase tracking-wider">Side</Label>
                    <Select
                      value={goalDraft.team_side}
                      onValueChange={(v) => setGoalDraft({ ...goalDraft, team_side: v as 'home' | 'away' })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="home">{editing.home_team_code}</SelectItem>
                        <SelectItem value="away">{editing.away_team_code}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <Button type="button" onClick={addGoal} size="sm" className="shrink-0">
                    <Plus className="w-4 h-4 mr-1" />
                    Goal
                  </Button>
                </div>
              </div>
            </div>
          )}

          <DialogFooter className="flex flex-row sm:justify-between gap-2">
            <div>
              {editing?.manual_override && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => editing && setConfirmRelease(editing)}
                  disabled={saving || releasing}
                >
                  <Unlock className="w-4 h-4 mr-2" />
                  Release to sync
                </Button>
              )}
            </div>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={closeEdit} disabled={saving}>Cancel</Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                Save
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Release confirmation. Shown after the user clicks "Release to sync"
          inside the edit dialog. Keeps the destructive action explicit —
          releasing wipes manual edits the next time a sync runs. */}
      <AlertDialog
        open={!!confirmRelease}
        onOpenChange={(open) => { if (!open && !releasing) setConfirmRelease(null); }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Release {confirmRelease?.home_team_code} vs {confirmRelease?.away_team_code}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This will clear your manual override for this match and immediately
              sync from football-data.org. Any values you entered (scores, teams,
              kick-off, venue, city, status) will be replaced by FD's data — and
              for fields FD doesn't supply (like city), reset to empty.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={releasing}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                if (confirmRelease) void performRelease(confirmRelease);
              }}
              disabled={releasing}
            >
              {releasing ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Releasing…
                </>
              ) : (
                <>
                  <Unlock className="w-4 h-4 mr-2" />
                  Release & sync
                </>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
};
