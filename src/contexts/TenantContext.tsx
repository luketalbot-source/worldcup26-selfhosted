import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';

interface Tenant {
  id: string;
  uid: string;
  name: string;
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
        const { data, error: fetchError } = await supabase
          .rpc('get_tenant_by_uid', { _uid: tenantUid });

        if (fetchError) throw fetchError;

        if (!data || data.length === 0) {
          setError('Tenant not found');
          setTenant(null);
        } else {
          setTenant(data[0] as Tenant);
          setError(null);
        }
      } catch (err) {
        console.error('Error fetching tenant:', err);
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
