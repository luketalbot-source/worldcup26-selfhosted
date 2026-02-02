import { useState, useEffect } from 'react';
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Navigation } from '@/components/Navigation';
import { MatchesView } from '@/components/MatchesView';
import { BoostView } from '@/components/BoostView';
import { LeaguesView } from '@/components/LeaguesView';
import { ProfileView } from '@/components/ProfileView';
import { useAuth } from '@/contexts/AuthContext';
import { useTenant } from '@/contexts/TenantContext';
import { useIframeAuth } from '@/hooks/useIframeAuth';
import { supabase } from '@/integrations/supabase/client';
import { Loader2 } from 'lucide-react';

const TenantApp = () => {
  const [activeTab, setActiveTab] = useState('matches');
  const [checkingTenantMatch, setCheckingTenantMatch] = useState(true);
  const location = useLocation();
  const navigate = useNavigate();
  const { tenantUid } = useParams();
  const [searchParams] = useSearchParams();
  const { user, loading: authLoading, signOut } = useAuth();
  const { tenant, tenantId, loading: tenantLoading, error: tenantError } = useTenant();
  
  // Check for dev load test mode - bypasses auth requirement
  const isDevMode = searchParams.get('devLoadTest') === 'true';

  // Iframe auth support - handle postMessage tokens and user changes
  useIframeAuth({
    tenantId: tenantId || null,
    tenantUid,
    onAuthSuccess: () => {
      // User authenticated via postMessage, no action needed - we're already on the app
      console.log('[TenantApp] Auth success via postMessage');
    },
    onAuthError: (err) => {
      console.error('[TenantApp] Auth error via postMessage:', err);
    },
    onUserMismatch: () => {
      // User changed in parent, will need to re-auth
      console.log('[TenantApp] User mismatch, redirecting to auth');
      navigate(`/t/${tenantUid}/auth`, { replace: true });
    },
  });

  // Set document title
  useEffect(() => {
    document.title = 'WC2026 Predictor';
  }, []);

  // Check if user belongs to this tenant, if not sign them out
  useEffect(() => {
    const checkUserTenant = async () => {
      if (authLoading || tenantLoading || !user || !tenantId || !tenant) {
        setCheckingTenantMatch(false);
        return;
      }

      try {
        // For OIDC tenants, tenant membership is determined by an OIDC identity row,
        // NOT by profiles.tenant_id (profiles are currently global/shared).
        if (tenant.auth_method === 'oidc') {
          const { data: identity, error } = await supabase
            .from('oidc_identities')
            .select('id')
            .eq('user_id', user.id)
            .eq('tenant_id', tenantId)
            .maybeSingle();

          if (error) {
            console.error('Error checking OIDC identity:', error);
          }

          if (!identity) {
            console.log('User has no OIDC identity for this tenant, signing out');
            await signOut();
          }

          return;
        }

        // For OTP tenants, keep the existing profile-based check.
        const { data: profile } = await supabase
          .from('profiles')
          .select('tenant_id')
          .eq('user_id', user.id)
          .maybeSingle();

        if (profile && profile.tenant_id && profile.tenant_id !== tenantId) {
          console.log('User belongs to different tenant, signing out');
          await signOut();
        }
      } catch (err) {
        console.error('Error checking user tenant:', err);
      } finally {
        setCheckingTenantMatch(false);
      }
    };

    checkUserTenant();
  }, [user, tenantId, tenant, authLoading, tenantLoading, signOut]);

  // Redirect to auth page if not logged in (skip in dev mode)
  useEffect(() => {
    if (!authLoading && !checkingTenantMatch && !user && tenantUid && !isDevMode) {
      navigate(`/t/${tenantUid}/auth`, { replace: true });
    }
  }, [user, authLoading, checkingTenantMatch, navigate, tenantUid, isDevMode]);

  // Handle navigation state (e.g., from header profile click)
  useEffect(() => {
    if (location.state?.tab) {
      setActiveTab(location.state.tab);
      window.history.replaceState({}, document.title);
    }
  }, [location.state]);

  // Show loading while checking tenant, auth, or tenant match
  if (tenantLoading || authLoading || checkingTenantMatch) {
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

  // Show nothing while redirecting (unless in dev mode)
  if (!user && !isDevMode) {
    return null;
  }

  const renderContent = () => {
    switch (activeTab) {
      case 'matches':
        return <MatchesView />;
      case 'boost':
        return <BoostView />;
      case 'leagues':
        return <LeaguesView />;
      case 'profile':
        return <ProfileView />;
      default:
        return <MatchesView />;
    }
  };

  return (
    <div className="min-h-screen bg-background pb-24">
      <main className="container py-4">
        {renderContent()}
      </main>
      
      <Navigation activeTab={activeTab} onTabChange={setActiveTab} />
    </div>
  );
};

export default TenantApp;
