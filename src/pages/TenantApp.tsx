import { useState, useEffect, useCallback } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { Navigation } from '@/components/Navigation';
import { MatchesView } from '@/components/MatchesView';
import { BoostView } from '@/components/BoostView';
import { LeaguesView } from '@/components/LeaguesView';
import { ProfileView } from '@/components/ProfileView';
import { useAuth } from '@/contexts/AuthContext';
import { useTenant } from '@/contexts/TenantContext';
import { useIframeAuth } from '@/hooks/useIframeAuth';
import { useOIDCSessionValidation } from '@/hooks/useOIDCSessionValidation';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { ExternalLink, Loader2, RotateCw } from 'lucide-react';

const TenantApp = () => {
  const [activeTab, setActiveTab] = useState('matches');
  const [checkingTenantMatch, setCheckingTenantMatch] = useState(true);
  const [showIframeFallback, setShowIframeFallback] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const { tenantUid } = useParams();
  const { user, loading: authLoading, signOut } = useAuth();
  const { tenant, tenantId, loading: tenantLoading, error: tenantError } = useTenant();

  // Iframe auth support - handle postMessage tokens and user changes
  const { isInIframe, tokenReceived } = useIframeAuth({
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

  // OIDC session validation - re-check IdP session for SSO users
  const handleOIDCSessionInvalid = useCallback(() => {
    console.log('[TenantApp] OIDC session invalid, redirecting to auth');
    navigate(`/t/${tenantUid}/auth`, { replace: true });
  }, [navigate, tenantUid]);

  // OIDC session validation - runs in background, doesn't block UI
  useOIDCSessionValidation({
    tenantId: tenantId || null,
    userId: user?.id || null,
    onSessionInvalid: handleOIDCSessionInvalid,
  });
  useEffect(() => {
    document.title = 'WC2026 Predictor';
  }, []);

  // If we're embedded and the host doesn't send an auth token, don't leave users stuck forever.
  // Show a fallback CTA after a short grace period.
  useEffect(() => {
    if (!isInIframe || user) {
      setShowIframeFallback(false);
      return;
    }

    const t = window.setTimeout(() => setShowIframeFallback(true), 2500);
    return () => window.clearTimeout(t);
  }, [isInIframe, user]);

  // Check if user belongs to this tenant, if not sign them out
  useEffect(() => {
    const checkUserTenant = async () => {
      if (authLoading || tenantLoading || !user || !tenantId) {
        setCheckingTenantMatch(false);
        return;
      }

      try {
        // Check if user's profile belongs to this tenant
        const { data: profile } = await supabase
          .from('profiles')
          .select('tenant_id')
          .eq('user_id', user.id)
          .maybeSingle();

        // If user has a profile but it's for a different tenant, sign them out and redirect
        if (profile && profile.tenant_id && profile.tenant_id !== tenantId) {
          console.log('User belongs to different tenant, signing out and redirecting');
          await signOut();
          // Navigate immediately to prevent loop
          navigate(`/t/${tenantUid}/auth`, { replace: true });
          return;
        }
        
        // User has no profile yet (new user) or belongs to this tenant - they can stay
        setCheckingTenantMatch(false);
      } catch (err) {
        console.error('Error checking user tenant:', err);
        setCheckingTenantMatch(false);
      }
    };

    checkUserTenant();
  }, [user, tenantId, authLoading, tenantLoading, signOut, navigate, tenantUid]);

  // Redirect to auth page if not logged in
  useEffect(() => {
    // In an iframe, we expect the host to provide auth via postMessage; don't hard-redirect
    // to /auth (which can trigger SSO redirects and create loops).
    if (!authLoading && !checkingTenantMatch && !user && tenantUid && !isInIframe && !tokenReceived) {
      navigate(`/t/${tenantUid}/auth`, { replace: true });
    }
  }, [user, authLoading, checkingTenantMatch, navigate, tenantUid, isInIframe, tokenReceived]);

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

  // Show nothing while redirecting
  if (!user) {
    if (isInIframe) {
      return (
        <div className="min-h-screen bg-background flex items-center justify-center">
          <div className="text-center space-y-3 px-6">
            <Loader2 className="w-7 h-7 animate-spin text-primary mx-auto" />
            <p className="text-sm text-muted-foreground">
              Waiting for sign-in from the host application…
            </p>

            {showIframeFallback && tenantUid && (
              <div className="pt-2 space-y-2">
                <Button
                  className="w-full"
                  onClick={() => {
                    // Open sign-in outside the iframe (SSO providers often block being framed).
                    const url = `${window.location.origin}/t/${tenantUid}/auth`;
                    window.open(url, '_blank', 'noopener,noreferrer');
                  }}
                >
                  <ExternalLink className="w-4 h-4 mr-2" />
                  Open sign-in in new tab
                </Button>

                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => window.location.reload()}
                >
                  <RotateCw className="w-4 h-4 mr-2" />
                  Reload
                </Button>

                <p className="text-xs text-muted-foreground">
                  If your organization supports seamless sign-in, keep this tab open.
                </p>
              </div>
            )}
          </div>
        </div>
      );
    }

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
