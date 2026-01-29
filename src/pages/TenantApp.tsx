import { useState, useEffect } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { Navigation } from '@/components/Navigation';
import { MatchesView } from '@/components/MatchesView';
import { LeaguesView } from '@/components/LeaguesView';
import { ProfileView } from '@/components/ProfileView';
import { useAuth } from '@/contexts/AuthContext';
import { useTenant } from '@/contexts/TenantContext';
import { supabase } from '@/integrations/supabase/client';
import { Loader2 } from 'lucide-react';

const TenantApp = () => {
  const [activeTab, setActiveTab] = useState('matches');
  const [checkingTenantMatch, setCheckingTenantMatch] = useState(true);
  const location = useLocation();
  const navigate = useNavigate();
  const { tenantUid } = useParams();
  const { user, loading: authLoading, signOut } = useAuth();
  const { tenant, tenantId, loading: tenantLoading, error: tenantError } = useTenant();

  // Set document title
  useEffect(() => {
    document.title = 'WC2026 Predictor';
  }, []);

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

        // If user has a profile but it's for a different tenant, sign them out
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
  }, [user, tenantId, authLoading, tenantLoading, signOut]);

  // Redirect to auth page if not logged in
  useEffect(() => {
    if (!authLoading && !checkingTenantMatch && !user && tenantUid) {
      navigate(`/t/${tenantUid}/auth`, { replace: true });
    }
  }, [user, authLoading, checkingTenantMatch, navigate, tenantUid]);

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
    return null;
  }

  const renderContent = () => {
    switch (activeTab) {
      case 'matches':
        return <MatchesView />;
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
