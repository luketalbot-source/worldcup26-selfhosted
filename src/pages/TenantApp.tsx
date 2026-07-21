import { useState, useEffect, useRef } from 'react';
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Navigation } from '@/components/Navigation';
import { MatchesView } from '@/components/MatchesView';
import { BoostView } from '@/components/BoostView';
import { LeaguesView } from '@/components/LeaguesView';
import { ProfileView } from '@/components/ProfileView';
import { StatsView } from '@/components/StatsView';
import { GoalCelebration } from '@/components/GoalCelebration';
import { useAuth } from '@/contexts/AuthContext';
import { useTenant } from '@/contexts/TenantContext';
import { LiveMatchesProvider } from '@/contexts/LiveMatchesContext';
import { CompetitionProvider, useCompetitions, isEnabled } from '@/contexts/CompetitionContext';
import { CompetitionHub } from '@/components/CompetitionHub';
import { CompetitionSwitchChip } from '@/components/CompetitionSwitchChip';
import { useIframeAuth } from '@/hooks/useIframeAuth';
import { api } from '@/lib/apiClient';
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
    },
    onAuthError: () => {
      // Error handled silently
    },
    onUserMismatch: () => {
      // User changed in parent, will need to re-auth
      navigate(`/t/${tenantUid}/auth`, { replace: true });
    },
  });

  // Set document title
  useEffect(() => {
    document.title = 'Football Predictor';
  }, []);

  // Check if user belongs to this tenant, if not sign them out
  useEffect(() => {
    const checkUserTenant = async () => {
      if (authLoading || tenantLoading || !user || !tenantId || !tenant) {
        setCheckingTenantMatch(false);
        return;
      }

      try {
        const data = await api.get<{ has_identity: boolean }>('/auth/identity', { tenant_id: tenantId });

        if (!data.has_identity) {
          await signOut();
        }
      } catch {
        // Error handled silently
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
      case 'stats':
        return <StatsView />;
      case 'leagues':
        return <LeaguesView />;
      case 'profile':
        return <ProfileView />;
      default:
        return <MatchesView />;
    }
  };

  return (
    // CompetitionProvider resolves which competitions this tenant has
    // enabled (feature flags) + which one is active; LiveMatchesProvider
    // consumes it to lazily fetch that competition's matches. Every view
    // (plus the global GoalCelebration overlay) shares a single SSE
    // connection and a single source of match-state truth.
    <CompetitionProvider>
      <LiveMatchesProvider>
        <TenantShell activeTab={activeTab} onTabChange={setActiveTab} renderContent={renderContent} />
      </LiveMatchesProvider>
    </CompetitionProvider>
  );
};

// Inner shell so it can read the competition context (it renders INSIDE
// CompetitionProvider). Multi-game tenants land on the game hub until a
// game is picked; the switch chip in competition-scoped tabs returns there.
const TenantShell = ({
  activeTab,
  onTabChange,
  renderContent,
}: {
  activeTab: string;
  onTabChange: (tab: string) => void;
  renderContent: () => JSX.Element;
}) => {
  const { competitions, activeCompetition, loading, clearActiveCompetition } = useCompetitions();

  // Landing tab per game: entering a COMPLETED game lands on Stats (the
  // champions/top-predictors recap — there are no fixtures left to predict);
  // a running game keeps the Matches default. Fires only when the active
  // competition actually changes (hub pick, switch chip, or the initial
  // auto-select for single-game tenants) so manual tab taps are never
  // overridden afterwards.
  const prevCompIdRef = useRef<string | null>(null);
  useEffect(() => {
    const id = activeCompetition?.id ?? null;
    if (id === prevCompIdRef.current) return;
    prevCompIdRef.current = id;
    // Never for the synthesized outage-fallback row — a live-game tenant
    // mid-API-blip must keep its Matches default, not get yanked to a
    // phantom archive's stats.
    if (activeCompetition && activeCompetition.is_active === false && !activeCompetition.isFallback) {
      onTabChange('stats');
    }
  }, [activeCompetition, onTabChange]);

  // The hub only shows on competition-scoped tabs — Leagues and Profile
  // aggregate across competitions. The switch chip, though, shows on EVERY
  // tab so the "back to game selector" affordance is always reachable.
  const competitionScoped = ['matches', 'boost', 'stats'].includes(activeTab);
  const showHub = competitionScoped && !loading && competitions.length > 1 && !activeCompetition;
  // Hide the bottom nav on the hub ONLY when the hub is escapable — i.e. it
  // offers at least one enterable (enabled) game. If a tenant has >1
  // competition but NONE enabled (every card is a non-clickable "coming
  // soon" teaser), a hidden nav would strand them: no game to enter, and the
  // nav is the only tab switcher, so no route to Leagues/Profile either — a
  // hard dead-end on a blank hub. In that degenerate case keep the nav.
  const hubEscapable = competitions.some(isEnabled);
  const hideNav = showHub && hubEscapable;

  return (
    // No bottom padding when the nav is hidden — there's nothing to clear.
    <div className={`min-h-screen bg-background ${hideNav ? '' : 'pb-24'}`}>
      <main className="container py-4 space-y-4">
        {loading ? (
          // Competition registry still resolving: the landing tab isn't
          // decided yet (completed games land on Stats), so don't mount a
          // tab's content only to yank it — a beat of spinner instead of a
          // Matches flash + discarded fetches.
          <div className="flex items-center justify-center py-24">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : showHub ? (
          <CompetitionHub />
        ) : (
          <>
            {/* Switch chip on the game-scoped tabs (and Leagues, whose
                Everyone board follows the active game). NOT on the Me tab —
                that's your global/lifetime page, so a "you're in Bundesliga"
                chip there is contradictory. "Switch game" resets to the
                matches tab AND clears the active competition, so the hub
                shows even when tapped from Leagues. Self-hides for
                single-competition tenants. */}
            {activeTab !== 'profile' && (
              <CompetitionSwitchChip
                onSwitchGame={() => {
                  onTabChange('matches');
                  clearActiveCompetition();
                }}
              />
            )}
            {renderContent()}
          </>
        )}
      </main>

      {/* The game hub is a full-screen entry gate: hide the bottom nav there
          so the only way forward is picking a game. Once a game is active —
          and always for single-competition tenants, which never see the hub —
          the nav returns. Kept visible on an inescapable (all-teaser) hub. */}
      {!hideNav && <Navigation activeTab={activeTab} onTabChange={onTabChange} />}

      {/* Global goal celebration overlay — pointer-events: none so it
          never blocks interaction. Renders only while a goal is active. */}
      <GoalCelebration />
    </div>
  );
};

export default TenantApp;
