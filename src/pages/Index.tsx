import { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Header } from '@/components/Header';
import { Navigation } from '@/components/Navigation';
import { MatchesView } from '@/components/MatchesView';
import { LeaguesView } from '@/components/LeaguesView';
import { ProfileView } from '@/components/ProfileView';
import { useAuth } from '@/contexts/AuthContext';

const Index = () => {
  const [activeTab, setActiveTab] = useState('matches');
  const location = useLocation();
  const navigate = useNavigate();
  const { user, loading } = useAuth();

  // Redirect to auth page if not logged in
  useEffect(() => {
    if (!loading && !user) {
      navigate('/auth', { replace: true });
    }
  }, [user, loading, navigate]);

  // Handle navigation state (e.g., from header profile click)
  useEffect(() => {
    if (location.state?.tab) {
      setActiveTab(location.state.tab);
      // Clear the state so it doesn't persist on refresh
      window.history.replaceState({}, document.title);
    }
  }, [location.state]);

  // Show nothing while checking auth or redirecting
  if (loading || !user) {
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
      <Header />
      
      <main className="container py-4">
        {renderContent()}
      </main>
      
      <Navigation activeTab={activeTab} onTabChange={setActiveTab} />
    </div>
  );
};

export default Index;
