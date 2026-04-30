import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '@/lib/apiClient';

interface OIDCConfig {
  authorization_endpoint: string;
  client_id: string;
  redirect_uri: string;
}

interface Tenant {
  id: string;
  uid: string;
  name: string;
  oidc_config?: OIDCConfig | null;
  // Per-tenant feature flag. When false, the leagues view collapses to
  // just the built-in "Everyone" league (no create/join, no custom
  // leagues visible). Default true.
  allow_custom_leagues: boolean;
}

interface TenantContextType {
  tenant: Tenant | null;
  tenantId: string | null;
  loading: boolean;
  error: string | null;
}

const TenantContext = createContext<TenantContextType | undefined>(undefined);

export const TenantProvider = ({ children }: { children: ReactNode }) => {
  const { tenantUid } = useParams<{ tenantUid: string }>();
  const navigate = useNavigate();
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchTenant = async () => {
      if (!tenantUid) {
        setError('No tenant specified');
        setLoading(false);
        return;
      }

      try {
        // Fetch tenant basic info
        const tenantData = await api.get<{
          id: string;
          uid: string;
          name: string;
          allow_custom_leagues?: boolean;
        }>(`/tenants/by-uid/${tenantUid}`);

        if (!tenantData) {
          setError('Tenant not found');
          setTenant(null);
          setLoading(false);
          return;
        }

        // Always fetch OIDC config (tenants always use OIDC). Missing config
        // is a valid state (dev-mode tenants without SSO), so swallow errors.
        let oidcConfig: OIDCConfig | null = null;
        try {
          oidcConfig = await api.get<OIDCConfig>(`/tenants/${tenantData.id}/oidc-config`);
        } catch {
          oidcConfig = null;
        }

        setTenant({
          id: tenantData.id,
          uid: tenantData.uid,
          name: tenantData.name,
          oidc_config: oidcConfig,
          // Default true so older API responses (pre-migration) still
          // produce the full leagues experience.
          allow_custom_leagues: tenantData.allow_custom_leagues ?? true,
        });
        setError(null);
      } catch {
        setError('Failed to load tenant');
      } finally {
        setLoading(false);
      }
    };

    fetchTenant();
  }, [tenantUid]);

  return (
    <TenantContext.Provider value={{
      tenant,
      tenantId: tenant?.id || null,
      loading,
      error
    }}>
      {children}
    </TenantContext.Provider>
  );
};

export const useTenant = () => {
  const context = useContext(TenantContext);
  if (context === undefined) {
    throw new Error('useTenant must be used within a TenantProvider');
  }
  return context;
};
