import { useEffect, useState } from 'react';
import { Loader2, Trophy } from 'lucide-react';
import { api } from '@/lib/apiClient';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';

// Per-tenant competition feature flags — the admin-side counterpart of
// tenant_competitions. New competitions default OFF everywhere so rollout
// is staged (dogfood tenant first, then customers). Disabling only hides
// the competition for that tenant; nothing is deleted.

interface TenantCompetitionRow {
  id: string;
  slug: string;
  name: string;
  short_name: string;
  season: string;
  format: string;
  is_active: boolean;
  display_order: number;
  enabled: boolean;
  // Set when an enablement is SCHEDULED (enabled_at in the future): the
  // tenant doesn't see the game yet; it flips on automatically at this
  // moment. Toggling the checkbox on makes it live immediately instead.
  scheduled_at?: string | null;
}

export const TenantCompetitions = ({ tenantId, tenantName }: { tenantId: string; tenantName: string }) => {
  const [rows, setRows] = useState<TenantCompetitionRow[] | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setRows(null);
    api
      .get<TenantCompetitionRow[]>(`/tenants/${tenantId}/competitions`)
      .then((data) => {
        if (!cancelled) setRows(data);
      })
      .catch((err) => {
        console.error('[tenant-competitions] load failed:', err);
        if (!cancelled) setRows([]);
      });
    return () => {
      cancelled = true;
    };
  }, [tenantId]);

  const toggle = async (row: TenantCompetitionRow, enabled: boolean) => {
    // A scheduled row is a loaded gun during an embargo week: enabling
    // launches the game for this tenant NOW (overriding the schedule), and
    // disabling silently drops the tenant from the scheduled go-live with
    // no way to re-create the schedule from this UI. Confirm both.
    if (row.scheduled_at) {
      const when = new Date(row.scheduled_at).toLocaleString();
      const ok = window.confirm(
        enabled
          ? `${row.short_name} is scheduled to go live ${when}. Enable it for ${tenantName} NOW instead?`
          : `${row.short_name} is scheduled to go live ${when}. Disabling CANCELS that scheduled go-live for ${tenantName} — it will NOT flip on automatically. Continue?`,
      );
      if (!ok) return;
    }
    setSavingId(row.id);
    try {
      await api.put(`/tenants/${tenantId}/competitions/${row.id}`, { enabled });
      // Enabling makes a scheduled row live NOW (server uses LEAST(…, now())),
      // and disabling cancels the schedule — either way it's gone.
      setRows((prev) =>
        prev ? prev.map((r) => (r.id === row.id ? { ...r, enabled, scheduled_at: null } : r)) : prev,
      );
      toast.success(`${row.short_name} ${enabled ? 'enabled' : 'disabled'} for ${tenantName}`);
    } catch (err) {
      console.error(err);
      toast.error('Failed to update competition');
    } finally {
      setSavingId(null);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Trophy className="w-5 h-5" />
          Competitions
        </CardTitle>
        <CardDescription>
          Which competitions this tenant's players can see and predict. New
          competitions are off by default — enable on a test tenant first,
          then roll out. Archived competitions stay visible read-only where
          enabled.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {rows === null ? (
          <div className="flex items-center justify-center py-4">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No competitions configured.</p>
        ) : (
          rows.map((row) => (
            <div key={row.id} className="flex items-start gap-3">
              <Checkbox
                id={`comp-${row.id}`}
                checked={row.enabled}
                disabled={savingId === row.id}
                onCheckedChange={(checked) => void toggle(row, checked === true)}
                className="mt-0.5"
              />
              <Label htmlFor={`comp-${row.id}`} className="space-y-1 cursor-pointer">
                <div className="text-sm font-medium leading-none flex items-center gap-2">
                  {row.name}
                  <span className="text-xs font-normal text-muted-foreground">
                    {row.season}
                  </span>
                  {!row.is_active && (
                    <span className="text-xs font-normal bg-muted text-muted-foreground px-1.5 py-0.5 rounded">
                      archived
                    </span>
                  )}
                </div>
                <p className="text-xs font-normal text-muted-foreground capitalize">
                  {row.format} format
                </p>
              </Label>
              {/* OUTSIDE the Label on purpose: the label toggles the
                  checkbox, and clicking a schedule announcement must never
                  fire the launch it announces. */}
              {row.scheduled_at && !row.enabled && (
                <span className="ml-auto shrink-0 text-xs font-normal bg-primary/10 text-primary px-1.5 py-0.5 rounded">
                  goes live {new Date(row.scheduled_at).toLocaleString()}
                </span>
              )}
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
};
