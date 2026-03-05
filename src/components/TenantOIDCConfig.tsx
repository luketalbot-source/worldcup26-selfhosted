import { useState, useEffect } from 'react';
import { Key, Save, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
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

interface OIDCConfig {
  id?: string;
  auth_url: string;
  client_id: string;
  redirect_uri: string;
  issuer?: string;
}

export const TenantOIDCConfig = ({ tenantId, tenantName, tenantUid }: TenantOIDCConfigProps) => {
  const [oidcConfig, setOidcConfig] = useState<OIDCConfig>({
    auth_url: '',
    client_id: '',
    redirect_uri: '',
    issuer: '',
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Generate default redirect URI
  const defaultRedirectUri = typeof window !== 'undefined'
    ? `${window.location.origin}/t/${tenantUid}/auth/callback`
    : `/t/${tenantUid}/auth/callback`;

  useEffect(() => {
    const fetchConfig = async () => {
      try {
        // Fetch OIDC config
        const { data: oidcData, error: oidcError } = await supabase
          .from('tenant_oidc_config')
          .select('*')
          .eq('tenant_id', tenantId)
          .maybeSingle();

        if (!oidcError && oidcData) {
          setOidcConfig({
            id: oidcData.id,
            auth_url: oidcData.auth_url,
            client_id: oidcData.client_id,
            redirect_uri: oidcData.redirect_uri,
            issuer: oidcData.issuer || '',
          });
        } else {
          // Set default redirect URI for new config
          setOidcConfig(prev => ({
            ...prev,
            redirect_uri: defaultRedirectUri,
          }));
        }
      } catch (err) {
        toast.error('Failed to load OIDC configuration');
      } finally {
        setLoading(false);
      }
    };

    fetchConfig();
  }, [tenantId, defaultRedirectUri]);

  const handleSave = async () => {
    setSaving(true);

    try {
      // Ensure auth_method is always 'oidc'
      const { error: tenantError } = await supabase
        .from('tenants')
        .update({ auth_method: 'oidc' })
        .eq('id', tenantId);

      if (tenantError) throw tenantError;

      // Validate required fields
      if (!oidcConfig.auth_url || !oidcConfig.client_id || !oidcConfig.redirect_uri) {
        toast.error('Please fill in all required OIDC fields');
        setSaving(false);
        return;
      }

      if (oidcConfig.id) {
        // Update existing config
        const { error } = await supabase
          .from('tenant_oidc_config')
          .update({
            auth_url: oidcConfig.auth_url,
            client_id: oidcConfig.client_id,
            redirect_uri: oidcConfig.redirect_uri,
            issuer: oidcConfig.issuer || null,
          })
          .eq('id', oidcConfig.id);

        if (error) throw error;
      } else {
        // Insert new config
        const { data, error } = await supabase
          .from('tenant_oidc_config')
          .insert({
            tenant_id: tenantId,
            auth_url: oidcConfig.auth_url,
            client_id: oidcConfig.client_id,
            redirect_uri: oidcConfig.redirect_uri,
            issuer: oidcConfig.issuer || null,
          })
          .select()
          .single();

        if (error) throw error;
        setOidcConfig(prev => ({ ...prev, id: data.id }));
      }

      toast.success('Configuration saved successfully');
    } catch (err) {
      toast.error('Failed to save configuration');
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
          Configure Single Sign-On for {tenantName}. Users will authenticate via your identity provider.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* OIDC Configuration Fields */}
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="auth-url">Authorization URL *</Label>
            <Input
              id="auth-url"
              placeholder="https://your-idp.com/oauth/authorize"
              value={oidcConfig.auth_url}
              onChange={(e) => setOidcConfig(prev => ({ ...prev, auth_url: e.target.value }))}
            />
            <p className="text-xs text-muted-foreground">
              The OIDC authorization endpoint from your identity provider
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="client-id">Client ID *</Label>
            <Input
              id="client-id"
              placeholder="your-client-id"
              value={oidcConfig.client_id}
              onChange={(e) => setOidcConfig(prev => ({ ...prev, client_id: e.target.value }))}
            />
            <p className="text-xs text-muted-foreground">
              The public client ID from your identity provider
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="redirect-uri">Redirect URI *</Label>
            <Input
              id="redirect-uri"
              placeholder={defaultRedirectUri}
              value={oidcConfig.redirect_uri}
              onChange={(e) => setOidcConfig(prev => ({ ...prev, redirect_uri: e.target.value }))}
            />
            <p className="text-xs text-muted-foreground">
              This URL must be registered in your identity provider. Default: <code className="text-xs">{defaultRedirectUri}</code>
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="issuer">Issuer URL (optional)</Label>
            <Input
              id="issuer"
              placeholder="https://your-idp.com"
              value={oidcConfig.issuer}
              onChange={(e) => setOidcConfig(prev => ({ ...prev, issuer: e.target.value }))}
            />
            <p className="text-xs text-muted-foreground">
              Optional: Used for token validation
            </p>
          </div>
        </div>

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
