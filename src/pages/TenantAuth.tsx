import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Loader2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useTenant } from '@/contexts/TenantContext';
import { useIframeAuth } from '@/hooks/useIframeAuth';
import { buildAuthorizationUrl } from '@/lib/oidc';

const TenantAuth = () => {
  const { tenantUid } = useParams();
  const { tenant, loading: tenantLoading, error: tenantError } = useTenant();
  const [error, setError] = useState('');
  const { user } = useAuth();
  const navigate = useNavigate();

  // Iframe auth support - handles postMessage tokens from parent
  useIframeAuth({
    tenantId: tenant?.id || null,
    tenantUid,
    onAuthSuccess: () => {
      navigate(`/t/${tenantUid}`);
    },
    onAuthError: (err) => {
      setError(err);
    },
    onUserMismatch: () => {
      // User changed in parent, will need to re-auth
      setError('');
    },
  });

  // Redirect if already logged in
  useEffect(() => {
    if (user && tenantUid) {
      navigate(`/t/${tenantUid}`);
    }
  }, [user, navigate, tenantUid]);

  // Immediately redirect to SSO (clickless flow)
  useEffect(() => {
    const triggerSSO = async () => {
      if (!tenant?.oidc_config) return;

      try {
        const authUrl = await buildAuthorizationUrl(
          tenant.oidc_config.auth_url,
          tenant.oidc_config.client_id,
          tenant.oidc_config.redirect_uri,
          tenant.id
        );
        window.location.href = authUrl;
      } catch {
        setError('Failed to start SSO login. Please contact support.');
      }
    };

    // Trigger SSO redirect when tenant is loaded, user not logged in, and OIDC config exists
    if (
      !user &&
      !tenantLoading &&
      tenant?.oidc_config
    ) {
      triggerSSO();
    }
  }, [tenant, tenantLoading, user]);

  // Show loading while checking tenant
  if (tenantLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  // Show error if tenant not found
  if (tenantError || !tenant) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-foreground mb-2">Tenant Not Found</h1>
          <p className="text-muted-foreground">The requested tenant does not exist.</p>
        </div>
      </div>
    );
  }

  // Show redirecting state (auto-redirect happens via useEffect)
  return (
    <div className="min-h-screen bg-background">
      <main className="container py-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-sm mx-auto text-center"
        >
          {/* Tenant badge */}
          <div className="text-center mb-6">
            <span className="inline-block px-3 py-1 bg-primary/10 text-primary rounded-full text-sm font-medium">
              {tenant.name}
            </span>
          </div>

          {error ? (
            <div className="space-y-4">
              <p className="text-sm text-destructive">{error}</p>
              <p className="text-muted-foreground text-sm">
                Please contact your administrator for assistance.
              </p>
            </div>
          ) : !tenant.oidc_config ? (
            <div className="space-y-4">
              <p className="text-sm text-destructive">SSO is not configured for this tenant.</p>
              <p className="text-muted-foreground text-sm">
                Please contact your administrator to set up OIDC authentication.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto" />
              <p className="text-muted-foreground">
                Redirecting to your organization's login...
              </p>
            </div>
          )}
        </motion.div>
      </main>
    </div>
  );
};

export default TenantAuth;
