import { useState, useEffect } from 'react';
import { Key, Save, Loader2, Info, AlertCircle, Copy, Check, Send, AppWindow, Lock, Pencil } from 'lucide-react';
import { api, ApiError } from '@/lib/apiClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';

interface TenantOIDCConfigProps {
  tenantId: string;
  tenantName: string;
  tenantUid: string;
}

// What the backend returns. client_secret is omitted; has_client_secret is a
// boolean kept for backward-compat with already-saved configs but no longer
// surfaced in the UI — Flip's IdP doesn't issue a confidential client to us
// so the field was always either blank or noise.
interface OIDCConfigResponse {
  issuer: string;
  client_id: string;
  redirect_uri: string;
  authorization_endpoint: string;
  token_endpoint: string;
  userinfo_endpoint: string;
  jwks_uri: string;
  consent_required?: boolean;
  has_client_secret?: boolean;
}

// Production base URL for the user-facing app. Used as the default value
// for the redirect URI helper text + the "share with Flip" card so the
// values an admin copies match what's deployed at Flip — not the code.run
// preview URL their browser happens to be on right now. Overridable per
// deployment via VITE_PUBLIC_BASE_URL (the domain outlives the wc2026 name).
const PRODUCTION_BASE_URL =
  (import.meta.env.VITE_PUBLIC_BASE_URL as string | undefined) ??
  'https://wc2026.rnd.team.getflip.gg';

// Strip the standard /auth/callback suffix to get the base tenant URL —
// what the Flip Admin and Menu tile actually need (the OIDC layer adds the
// suffix on its own).
function stripCallbackSuffix(url: string): string {
  return url.replace(/\/auth\/callback\/?$/, '');
}

// Reusable copy-to-clipboard field. Read-only input + a copy button that
// flips to a check + "Copied" for ~1.5s. Falls back to a `document.execCommand`
// path when navigator.clipboard is unavailable (iframe / insecure contexts).
const CopyableField = ({
  label,
  value,
  helperText,
}: {
  label: string;
  value: string;
  helperText?: string;
}) => {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(value);
      } else {
        const ta = document.createElement('textarea');
        ta.value = value;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      setCopied(true);
      toast.success(`${label} copied`);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error('Could not copy — please copy manually');
    }
  };

  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <div className="flex gap-2">
        <Input
          value={value}
          readOnly
          className="font-mono text-sm bg-muted/40"
          onFocus={(e) => e.currentTarget.select()}
        />
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={copy}
          aria-label={`Copy ${label}`}
          className="shrink-0"
        >
          {copied ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
        </Button>
      </div>
      {helperText && <p className="text-xs text-muted-foreground">{helperText}</p>}
    </div>
  );
};

export const TenantOIDCConfig = ({ tenantId, tenantName, tenantUid }: TenantOIDCConfigProps) => {
  const [issuer, setIssuer] = useState('');
  const [clientId, setClientId] = useState('');
  const [redirectUri, setRedirectUri] = useState('');
  const [loaded, setLoaded] = useState<OIDCConfigResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  // The bottom OIDC config section defaults to read-only. Admins kept
  // accidentally copying the *bottom* redirect URI (with /auth/callback)
  // into Flip's OIDC settings, when Flip actually needs the bare tenant
  // URL from the "Share with Flip" card above. Locking edits behind an
  // explicit toggle makes the bottom section visually a reference panel,
  // while still allowing first-time-setup edits when needed.
  const [editing, setEditing] = useState(false);

  // Default redirect URI uses the production base URL so the helper text /
  // share card show what an admin should give to Flip — independent of the
  // current browser origin (which during dev/preview is a code.run subdomain).
  const defaultRedirectUri = `${PRODUCTION_BASE_URL}/t/${tenantUid}/auth/callback`;

  useEffect(() => {
    const fetchConfig = async () => {
      try {
        const data = await api.get<OIDCConfigResponse>(`/tenants/${tenantId}/oidc-config`);
        setIssuer(data.issuer ?? '');
        setClientId(data.client_id ?? '');
        setRedirectUri(data.redirect_uri ?? defaultRedirectUri);
        setLoaded(data);
      } catch (err) {
        if (err instanceof ApiError && err.status === 404) {
          // No config yet — seed sensible defaults.
          setRedirectUri(defaultRedirectUri);
        } else {
          toast.error('Failed to load OIDC configuration');
        }
      } finally {
        setLoading(false);
      }
    };

    fetchConfig();
  }, [tenantId, defaultRedirectUri]);

  const handleSave = async () => {
    setSaveError(null);

    if (!issuer || !clientId || !redirectUri) {
      setSaveError('Issuer, Client ID, and Redirect URI are required');
      return;
    }

    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        issuer: issuer.trim(),
        client_id: clientId.trim(),
        redirect_uri: redirectUri.trim(),
      };

      const saved = await api.patch<OIDCConfigResponse>(`/tenants/${tenantId}/oidc-config`, body);
      setLoaded(saved);
      // Sync local inputs to the canonical values the server stored (issuer
      // may have been normalised to the IdP's self-declared value during
      // discovery — e.g. /realms/show/protocol/openid-connect/auth →
      // /realms/show).
      setIssuer(saved.issuer);
      // Snap back to read-only after a successful save so the section
      // returns to its "reference panel" presentation.
      setEditing(false);
      toast.success('OIDC configuration saved');
    } catch (err) {
      const message = err instanceof ApiError
        ? err.message
        : err instanceof Error
          ? err.message
          : 'Failed to save configuration';
      setSaveError(message);
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="py-8 flex justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  // What an admin actually copies to Flip: the tenant's base URL, no callback
  // suffix. Mirrors whatever's currently in the redirect URI input so an
  // override flows through to the share card without reload.
  const tenantBaseUrl = stripCallbackSuffix(redirectUri || defaultRedirectUri);

  return (
    <div className="space-y-6">
      {/* Share-with-Flip card. Gives the Flip Admin + Menu tile the values
          they need to onboard this tenant, with copy-buttons next to each. */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Send className="w-5 h-5" />
            App setup
          </CardTitle>
          <CardDescription>
            Pass these values to the Flip team to wire <strong>{tenantName}</strong> into
            their identity provider and menu.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Send to Flip Admin */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Send className="w-4 h-4 text-muted-foreground" />
              OIDC settings for Flip Tenant Controller
            </div>
            <CopyableField
              label="OIDC Client ID"
              value={clientId || '(set Client ID in the form below first)'}
            />
            <CopyableField
              label="Redirect URI"
              value={tenantBaseUrl}
            />
          </div>

          {/* Configure in Flip Menu tile */}
          <div className="space-y-3 pt-2 border-t">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <AppWindow className="w-4 h-4 text-muted-foreground" />
              Configure this in your Flip Menu tile
            </div>
            <CopyableField
              label="Tile URL"
              value={tenantBaseUrl}
            />
          </div>
        </CardContent>
      </Card>

      {/* The OIDC config itself. Locked to read-only by default so admins
          don't grab the bottom Redirect URI (with /auth/callback) and paste
          it into Flip — the value Flip needs lives in the "Share with Flip"
          card above. An explicit Edit toggle unlocks the inputs for the
          rare cases first-time setup or a re-keying is needed. */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1.5">
              <CardTitle className="flex items-center gap-2">
                <Key className="w-5 h-5" />
                SSO (OIDC) Configuration
                {!editing && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                    <Lock className="w-3 h-3" />
                    Read-only
                  </span>
                )}
              </CardTitle>
              <CardDescription>
                Current SSO config for <strong>{tenantName}</strong>. To share values with
                Flip, copy from <em>Share with Flip</em> above — the Redirect URI here ends
                in <code>/auth/callback</code> and is for the IdP, <strong>not Flip</strong>.
              </CardDescription>
            </div>
            {!editing && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setSaveError(null);
                  setEditing(true);
                }}
                className="shrink-0"
              >
                <Pencil className="w-4 h-4 mr-2" />
                Edit
              </Button>
            )}
          </div>
        </CardHeader>

        <CardContent className="space-y-6">
          {editing ? (
            <>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="issuer">Issuer URL *</Label>
                  <Input
                    id="issuer"
                    placeholder="https://login.microsoftonline.com/{tenant-id}/v2.0"
                    value={issuer}
                    onChange={(e) => setIssuer(e.target.value)}
                    autoComplete="off"
                  />
                  <p className="text-xs text-muted-foreground">
                    The OIDC issuer. Must serve <code>/.well-known/openid-configuration</code>.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="client-id">Client ID *</Label>
                  <Input
                    id="client-id"
                    placeholder="your-client-id"
                    value={clientId}
                    onChange={(e) => setClientId(e.target.value)}
                    autoComplete="off"
                  />
                </div>

                {/* Client Secret intentionally omitted — Flip's IdP issues a
                    public (PKCE) client, not a confidential one, so this field
                    was always either blank or wrong. The backend still accepts
                    client_secret for back-compat but we no longer surface it. */}

                <div className="space-y-2">
                  <Label htmlFor="redirect-uri">Redirect URI *</Label>
                  <Input
                    id="redirect-uri"
                    placeholder={defaultRedirectUri}
                    value={redirectUri}
                    onChange={(e) => setRedirectUri(e.target.value)}
                    autoComplete="off"
                  />
                  <p className="text-xs text-muted-foreground">
                    Must be registered in your IdP. Default: <code className="break-all">{defaultRedirectUri}</code>
                  </p>
                </div>
              </div>
            </>
          ) : (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Issuer URL</Label>
                <Input value={issuer || '(not configured)'} readOnly className="font-mono text-sm bg-muted/40" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Client ID</Label>
                <Input value={clientId || '(not configured)'} readOnly className="font-mono text-sm bg-muted/40" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Redirect URI</Label>
                <Input value={redirectUri || '(not configured)'} readOnly className="font-mono text-sm bg-muted/40" />
                <p className="text-xs text-muted-foreground">
                  Registered in the IdP — <strong>not</strong> the value to share with Flip.
                </p>
              </div>
            </div>
          )}

          {loaded && (
            <div className="rounded-md bg-muted/50 p-3 text-xs space-y-1">
              <div className="flex items-center gap-1.5 font-medium text-muted-foreground mb-1">
                <Info className="w-3.5 h-3.5" />
                Discovered endpoints (read-only)
              </div>
              <div><span className="text-muted-foreground">authorization_endpoint:</span> <code className="break-all">{loaded.authorization_endpoint}</code></div>
              <div><span className="text-muted-foreground">token_endpoint:</span> <code className="break-all">{loaded.token_endpoint}</code></div>
              <div><span className="text-muted-foreground">userinfo_endpoint:</span> <code className="break-all">{loaded.userinfo_endpoint}</code></div>
              <div><span className="text-muted-foreground">jwks_uri:</span> <code className="break-all">{loaded.jwks_uri}</code></div>
            </div>
          )}

          {editing && saveError && (
            <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              <div className="break-words">{saveError}</div>
            </div>
          )}

          {editing && (
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  // Revert local edits to whatever the server most recently
                  // confirmed, so cancelling never accidentally persists
                  // half-typed values on the next save.
                  if (loaded) {
                    setIssuer(loaded.issuer ?? '');
                    setClientId(loaded.client_id ?? '');
                    setRedirectUri(loaded.redirect_uri ?? defaultRedirectUri);
                  }
                  setSaveError(null);
                  setEditing(false);
                }}
                disabled={saving}
                className="flex-1"
              >
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={saving} className="flex-1">
                {saving ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Save className="w-4 h-4 mr-2" />
                )}
                Save Configuration
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
