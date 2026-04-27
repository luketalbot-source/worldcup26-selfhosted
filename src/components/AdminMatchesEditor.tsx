import { useState, useEffect, useMemo } from 'react';
import { Loader2, Lock, Unlock, Save, Calendar, Filter } from 'lucide-react';
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';

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
}

// FD's full status enum + a couple of useful synonyms.
const STATUS_OPTIONS = [
  'SCHEDULED',
  'TIMED',
  'IN_PLAY',
  'PAUSED',
  'FINISHED',
  'POSTPONED',
  'CANCELLED',
  'SUSPENDED',
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

  const handleRelease = async (match: AdminMatch) => {
    try {
      const updated = await api.delete<AdminMatch>(`/admin/matches/${encodeURIComponent(match.match_id)}/override`);
      setMatches((rows) => rows.map((r) => (r.match_id === updated.match_id ? updated : r)));
      toast.success('Override released — next sync will refresh this row');
    } catch (err) {
      toast.error('Failed to release override');
      console.error(err);
    }
  };

  const updateDraft = <K extends keyof AdminMatch>(k: K, v: AdminMatch[K] | null) => {
    setDraft((d) => (d ? { ...d, [k]: v } : d));
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
                <Label htmlFor="match_date">Kickoff (your local time)</Label>
                <Input
                  id="match_date"
                  type="datetime-local"
                  value={isoToLocalInput(draft.match_date ?? editing.match_date)}
                  onChange={(e) => updateDraft('match_date', localInputToIso(e.target.value))}
                />
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

              {/* Status */}
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
                      <SelectItem key={s} value={s}>{s}</SelectItem>
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
            </div>
          )}

          <DialogFooter className="flex flex-row sm:justify-between gap-2">
            <div>
              {editing?.manual_override && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => editing && handleRelease(editing)}
                  disabled={saving}
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
    </Card>
  );
};
