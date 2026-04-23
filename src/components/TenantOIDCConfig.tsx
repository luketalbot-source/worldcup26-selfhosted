import { useState, useEffect } from 'react';
import { Key, Save, Loader2, Info, AlertCircle } from 'lucide-react';
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

// What the backend returns (client_secret is omitted; has_client_secret is a boolean).
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

export const TenantOIDCConfig = ({ tenantId, tenantName, tenantUid }: TenantOIDCConfigProps) => {
  const [issuer, setIssuer] = useState('');
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [redirectUri, setRedirectUri] = useState('');
  const [hasExistingSecret, setHasExistingSecret] = useState(false);
  const [loaded, setLoaded] = useState<OIDCConfigResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const defaultRedirectUri = typeof window !== 'undefined'
    ? `${window.location.origin}/t/${tenantUid}/auth/callback`
    : `/t/${tenantUid}/auth/callback`;

  useEffect(() => {
    const fetchConfig = async () => {
      try {
        const data = await api.get<OIDCConfigResponse>(`/tenants/${tenantId}/oidc-config`);
        setIssuer(data.issuer ?? '');
        setClientId(data.client_id ?? '');
        setRedirectUri(data.redirect_uri ?? defaultRedirectUri);
        setHasExistingSecret(!!data.has_client_secret);
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
      if (clientSecret) body.client_secret = clientSecret;

      const saved = await api.patch<OIDCConfigResponse>(`/tenants/${tenantId}/oidc-config`, body);
      setLoaded(saved);
      setHasExistingSecret(!!saved.has_client_secret);
      setClientSecret('');
      // Sync local inputs to the canonical values the server stored (issuer
      // may have been normalised to the IdP's self-declared value during
      // discovery — e.g. /realms/show/protocol/openid-connect/auth →
      // /realms/show).
      setIssuer(saved.issuer);
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

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Key className="w-5 h-5" />
          SSO (OIDC) Configuration
        </CardTitle>
        <CardDescription>
          Configure Single Sign-On for <strong>{tenantName}</strong>. Endpoints are
          auto-discovered from the issuer URL on save — no need to enter them manually.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
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

          <div className="space-y-2">
            <Label htmlFor="client-secret">
              Client Secret {hasExistingSecret && <span className="text-muted-foreground font-normal">(already set — leave blank to keep)</span>}
            </Label>
            <Input
              id="client-secret"
              type="password"
              placeholder={hasExistingSecret ? '••••••••' : 'your-client-secret'}
              value={clientSecret}
              onChange={(e) => setClientSecret(e.target.value)}
              autoComplete="new-password"
            />
            <p className="text-xs text-muted-foreground">
              Required for the authorization-code flow. Stored encrypted-at-rest.
            </p>
          </div>

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

        {saveError && (
          <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
            <div className="break-words">{saveError}</div>
          </div>
        )}

        <Button onClick={handleSave} disabled={saving} className="w-full">
          {saving ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <Save className="w-4 h-4 mr-2" />
          )}
          Save Configuration
        </Button>
      </CardContent>
    </Card>
  );
};
