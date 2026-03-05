import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';

interface OIDCConfig {
  auth_url: string;
  client_id: string;
  redirect_uri: string;
}

interface Tenant {
  id: string;
  uid: string;
  name: string;
  oidc_config?: OIDCConfig | null;
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
        const { data: tenantData, error: fetchError } = await supabase
          .rpc('get_tenant_by_uid', { _uid: tenantUid });

        if (fetchError) throw fetchError;

        if (!tenantData || tenantData.length === 0) {
          setError('Tenant not found');
          setTenant(null);
          setLoading(false);
          return;
        }

        const tenantRow = tenantData[0];

        // Always fetch OIDC config (tenants always use OIDC)
        let oidcConfig: OIDCConfig | null = null;
        const { data: oidcData, error: oidcError } = await supabase
          .from('tenant_oidc_config')
          .select('auth_url, client_id, redirect_uri')
          .eq('tenant_id', tenantRow.id)
          .single();

        if (!oidcError && oidcData) {
          oidcConfig = oidcData;
        }

        setTenant({
          id: tenantRow.id,
          uid: tenantRow.uid,
          name: tenantRow.name,
          oidc_config: oidcConfig,
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
