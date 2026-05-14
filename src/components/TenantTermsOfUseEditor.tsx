// Per-tenant "Terms of Use" editor for the admin Settings tab.
//
// Surfaces a single Textarea bound to tenants.terms_of_use. When the
// tenant's stored value is non-empty, the user-facing nav footer
// renders a "Terms" link next to the trademark disclaimer; that link
// opens a dialog with this exact text. Blank → no link.
//
// Why a dedicated component (not inline in Admin.tsx): each selected
// tenant needs its own draft state, save/saving flags, and dirty
// detection. Hoisting that into the page component would either
// require extra plumbing to reset on tenant switch, or risk leaking
// the previous tenant's draft into a freshly-selected one.

import { useEffect, useState } from 'react';
import { FileText, Loader2, Save, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { api, ApiError } from '@/lib/apiClient';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

interface TenantTermsOfUseEditorProps {
  tenantId: string;
  tenantName: string;
  /** Current saved value as known to the parent (admin page). */
  value: string | null | undefined;
  /** Called with the new value after a successful save so the parent
   *  can sync its own state without refetching. */
  onSaved: (next: string | null) => void;
}

export const TenantTermsOfUseEditor = ({
  tenantId,
  tenantName,
  value,
  onSaved,
}: TenantTermsOfUseEditorProps) => {
  const [draft, setDraft] = useState<string>(value ?? '');
  const [saving, setSaving] = useState(false);
  const [clearing, setClearing] = useState(false);

  // Reset the draft when the admin switches between tenants. Without
  // this the previous tenant's draft would leak into the next one's
  // editor on first render.
  useEffect(() => {
    setDraft(value ?? '');
  }, [tenantId, value]);

  const trimmed = draft.trim();
  const stored = (value ?? '').trim();
  const dirty = trimmed !== stored;
  const hasStored = stored.length > 0;

  const handleSave = async () => {
    setSaving(true);
    try {
      // Empty string → null on the server (the backend already coerces,
      // but matching the convention here keeps the wire payload tidy).
      const next = trimmed.length === 0 ? null : draft;
      await api.patch(`/tenants/${tenantId}`, { terms_of_use: next });
      onSaved(next);
      toast.success(
        next === null
          ? `Terms cleared for ${tenantName}`
          : `Terms saved for ${tenantName}`,
      );
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Failed to save terms';
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  const handleClear = async () => {
    setClearing(true);
    try {
      await api.patch(`/tenants/${tenantId}`, { terms_of_use: null });
      onSaved(null);
      setDraft('');
      toast.success(`Terms cleared for ${tenantName}`);
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Failed to clear terms';
      toast.error(msg);
    } finally {
      setClearing(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileText className="w-5 h-5" />
          Terms of Use
        </CardTitle>
        <CardDescription>
          Optional. When non-empty, a <strong>Terms</strong> link appears in the
          app footer next to the trademark disclaimer; tapping it opens a
          dialog with this text. Leave blank to hide the link.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Paste your Terms of Use here. Plain text — line breaks are preserved."
          className="min-h-[180px] text-sm"
        />
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-muted-foreground">
            {trimmed.length === 0
              ? 'Empty — no link will be shown.'
              : `${trimmed.length.toLocaleString()} characters`}
          </span>
          <div className="flex gap-2">
            {hasStored && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleClear}
                disabled={clearing || saving}
              >
                {clearing ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Trash2 className="w-4 h-4 mr-2" />
                )}
                Clear
              </Button>
            )}
            <Button
              type="button"
              size="sm"
              onClick={handleSave}
              disabled={!dirty || saving}
            >
              {saving ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Save className="w-4 h-4 mr-2" />
              )}
              Save
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
