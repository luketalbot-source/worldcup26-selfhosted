// Admin panel for managing per-team player rosters.
//
// FD's free tier carries no national-team squads, so we feed this table
// by hand. Workflow is:
//
//   1. Pick a team from the grid (also shows the current row count per
//      team so you can see at a glance what's missing).
//   2. Paste a JSON or newline-separated list of players. JSON gives you
//      position / shirt_number; newline-only mode is fine for "I just
//      want names in quickly".
//   3. Choose Replace (wipe team's existing roster first) or Upsert.
//   4. Submit. The backend returns inserted / updated / total counts.
//
// Once a roster is loaded, every boost picker for that country shows
// the players immediately — the singleton cache in useQualifiedPlayers
// is invalidated via refreshPlayers() after each successful import.

import { useEffect, useMemo, useState } from 'react';
import { Loader2, Save, Trash2, Upload, AlertTriangle, CheckCircle2, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { api, ApiError } from '@/lib/apiClient';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
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
import { useQualifiedTeams } from '@/hooks/useQualifiedTeams';
import { refreshPlayers } from '@/hooks/useQualifiedPlayers';
import { useTeamName } from '@/hooks/useTeamName';

interface CountRow {
  team_code: string;
  player_count: number;
}

interface PlayerInput {
  full_name: string;
  position?: string | null;
  shirt_number?: number | null;
  date_of_birth?: string | null;
}

interface ParseResult {
  players: PlayerInput[];
  error: string | null;
}

// Accept two input formats so the admin can move fast in either mode:
//   - JSON array of {full_name, position?, shirt_number?, date_of_birth?}
//     — full structured data when sourced from Wikipedia/Transfermarkt.
//   - Newline-separated bare names — copy-paste from a Wikipedia
//     squad-list section when you only care about names. One name per
//     line, leading/trailing whitespace trimmed, empty lines skipped.
function parseInput(raw: string): ParseResult {
  const trimmed = raw.trim();
  if (!trimmed) return { players: [], error: null };

  // JSON path. The leading char gives away intent — '[' or '{' (the
  // latter for a single-object paste, which we wrap).
  if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmed);
      const arr = Array.isArray(parsed) ? parsed : [parsed];
      const players: PlayerInput[] = [];
      for (const [i, item] of arr.entries()) {
        if (typeof item !== 'object' || item === null) {
          return { players: [], error: `Entry ${i + 1} is not an object` };
        }
        const obj = item as Record<string, unknown>;
        const name = obj.full_name ?? obj.name;
        if (typeof name !== 'string' || !name.trim()) {
          return { players: [], error: `Entry ${i + 1} missing full_name / name` };
        }
        players.push({
          full_name: String(name).trim(),
          position:
            typeof obj.position === 'string' && obj.position.trim()
              ? obj.position.trim()
              : null,
          shirt_number:
            typeof obj.shirt_number === 'number' && Number.isFinite(obj.shirt_number)
              ? obj.shirt_number
              : null,
          date_of_birth:
            typeof obj.date_of_birth === 'string' && obj.date_of_birth.trim()
              ? obj.date_of_birth.trim()
              : null,
        });
      }
      return { players, error: null };
    } catch (e) {
      return {
        players: [],
        error: `Invalid JSON: ${e instanceof Error ? e.message : String(e)}`,
      };
    }
  }

  // Plain-text path: one name per line.
  const players = trimmed
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => ({ full_name: line } as PlayerInput));
  return { players, error: null };
}

export const AdminPlayersEditor = () => {
  const teams = useQualifiedTeams();
  const { getTeamName } = useTeamName();

  const [counts, setCounts] = useState<CountRow[]>([]);
  const [countsLoading, setCountsLoading] = useState(true);
  const [selectedTeam, setSelectedTeam] = useState<string | null>(null);
  const [rawInput, setRawInput] = useState('');
  const [replace, setReplace] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const fetchCounts = async () => {
    setCountsLoading(true);
    try {
      const rows = await api.get<CountRow[]>('/players/admin/counts');
      setCounts(rows);
    } catch (err) {
      if (!(err instanceof ApiError && err.status === 403)) {
        console.error('[admin-players] counts fetch failed', err);
      }
    } finally {
      setCountsLoading(false);
    }
  };

  useEffect(() => {
    void fetchCounts();
  }, []);

  const countsByCode = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of counts) m.set(r.team_code, r.player_count);
    return m;
  }, [counts]);

  // Parse the textarea on every keystroke so the preview / submit button
  // can react. Errors surface inline rather than on submit.
  const parsed = useMemo(() => parseInput(rawInput), [rawInput]);
  const canSubmit = !!selectedTeam && parsed.error === null && parsed.players.length > 0;

  const handleSubmit = async () => {
    if (!selectedTeam || parsed.players.length === 0) return;
    setSubmitting(true);
    try {
      const res = await api.post<{
        team_code: string;
        inserted: number;
        updated: number;
        total: number;
      }>('/players/admin/import', {
        team_code: selectedTeam,
        replace,
        players: parsed.players,
      });
      toast.success(
        `${res.team_code}: ${res.inserted} new, ${res.updated} updated — ${res.total} total`,
      );
      setRawInput('');
      setReplace(false);
      refreshPlayers();
      await fetchCounts();
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : err instanceof Error ? err.message : 'Import failed';
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteTeam = async () => {
    if (!selectedTeam) return;
    setDeleting(true);
    try {
      const res = await api.delete<{ team_code: string; deleted: number }>(
        `/players/admin/by-team/${selectedTeam}`,
      );
      toast.success(`Cleared ${res.deleted} players from ${res.team_code}`);
      refreshPlayers();
      await fetchCounts();
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Delete failed';
      toast.error(msg);
    } finally {
      setDeleting(false);
    }
  };

  // Pulls every team's squad from football-data.org in a single API
  // round-trip and replaces our live_players rows per team. Manual
  // paste-imports (above) and this button can coexist: a paste-import
  // overrides FD's data for that team until the admin clicks Sync
  // again, at which point FD becomes canonical again. Mid-tournament
  // workflow is "sync once when FIFA's final 25-player cuts publish,
  // then paste-fix individual rows if FD lags on a transfer/injury".
  const handleSyncFromFd = async () => {
    setSyncing(true);
    try {
      const res = await api.post<{
        teams_in_response: number;
        teams_synced: number;
        rows_inserted: number;
        skipped: string[];
      }>('/players/admin/sync-from-fd');
      const skippedNote =
        res.skipped.length > 0 ? ` — skipped ${res.skipped.length} (${res.skipped.join(', ')})` : '';
      toast.success(
        `Synced ${res.rows_inserted} players across ${res.teams_synced}/${res.teams_in_response} teams${skippedNote}`,
      );
      refreshPlayers();
      await fetchCounts();
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : err instanceof Error ? err.message : 'Sync failed';
      toast.error(msg);
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Upload className="w-5 h-5" />
                Player rosters
              </CardTitle>
              <CardDescription className="mt-1.5">
                Pull every team's squad from football-data.org with one click, or paste a specific
                roster below for fine-grained control. Either path feeds the boost player picker.
              </CardDescription>
            </div>
            <Button
              type="button"
              variant="default"
              size="sm"
              onClick={handleSyncFromFd}
              disabled={syncing}
              className="shrink-0"
            >
              {syncing ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4 mr-2" />
              )}
              Sync from football-data.org
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Team grid with per-team counts */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <Label>Pick a team</Label>
              {countsLoading && <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
              {teams.map((tm) => {
                const count = countsByCode.get(tm.code) ?? 0;
                const isSelected = selectedTeam === tm.code;
                return (
                  <button
                    key={tm.code}
                    type="button"
                    onClick={() => setSelectedTeam(tm.code)}
                    className={`flex items-center justify-between gap-2 px-3 py-2 rounded-lg border text-left transition-colors text-sm ${
                      isSelected
                        ? 'border-primary bg-primary/10'
                        : 'border-border hover:bg-muted'
                    }`}
                  >
                    <span className="flex items-center gap-2 truncate">
                      <span>{tm.flag}</span>
                      <span className="truncate">{getTeamName(tm.code, tm.name)}</span>
                    </span>
                    <span
                      className={`text-xs tabular-nums shrink-0 ${
                        count === 0 ? 'text-destructive' : 'text-muted-foreground'
                      }`}
                    >
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {selectedTeam && (
            <>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="roster-input">
                    Roster for{' '}
                    <strong>{getTeamName(selectedTeam, teams.find((t) => t.code === selectedTeam)?.name)}</strong>
                  </Label>
                  <span className="text-xs text-muted-foreground">
                    Currently {countsByCode.get(selectedTeam) ?? 0} loaded
                  </span>
                </div>
                <Textarea
                  id="roster-input"
                  value={rawInput}
                  onChange={(e) => setRawInput(e.target.value)}
                  placeholder={`Paste JSON:
[
  {"full_name":"Lionel Messi","position":"FW","shirt_number":10},
  {"full_name":"Emiliano Martínez","position":"GK","shirt_number":23}
]

— or one name per line:
Lionel Messi
Emiliano Martínez
Lautaro Martínez
…`}
                  className="font-mono text-xs h-48"
                />

                {parsed.error ? (
                  <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
                    <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                    <div>{parsed.error}</div>
                  </div>
                ) : parsed.players.length > 0 ? (
                  <div className="flex items-start gap-2 rounded-md border border-border bg-muted/30 p-3 text-sm">
                    <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0 text-green-600" />
                    <div>
                      <strong>{parsed.players.length}</strong> players parsed.{' '}
                      {parsed.players.slice(0, 3).map((p) => p.full_name).join(', ')}
                      {parsed.players.length > 3 && '…'}
                    </div>
                  </div>
                ) : null}

                <div className="flex items-start gap-3 pt-1">
                  <Checkbox
                    id="replace"
                    checked={replace}
                    onCheckedChange={(v) => setReplace(v === true)}
                    className="mt-0.5"
                  />
                  <Label htmlFor="replace" className="font-normal cursor-pointer">
                    <div className="text-sm">Replace existing roster</div>
                    <div className="text-xs text-muted-foreground">
                      Clears all current rows for this team before inserting. Use when the squad changes
                      and you want stale players removed. Otherwise existing rows are kept and merged.
                    </div>
                  </Label>
                </div>
              </div>

              <div className="flex gap-2">
                <Button onClick={handleSubmit} disabled={!canSubmit || submitting} className="flex-1">
                  {submitting ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Save className="w-4 h-4 mr-2" />
                  )}
                  Import {parsed.players.length || ''} players
                </Button>

                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      variant="outline"
                      disabled={(countsByCode.get(selectedTeam) ?? 0) === 0 || deleting}
                    >
                      {deleting ? (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      ) : (
                        <Trash2 className="w-4 h-4 mr-2" />
                      )}
                      Clear
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>
                        Clear roster for {selectedTeam}?
                      </AlertDialogTitle>
                      <AlertDialogDescription>
                        Removes all {countsByCode.get(selectedTeam) ?? 0} players for{' '}
                        {getTeamName(selectedTeam, teams.find((t) => t.code === selectedTeam)?.name)}.
                        Existing predictions referencing those players keep their stored name
                        but won't match a roster row until you re-import.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={handleDeleteTeam}>Clear</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
