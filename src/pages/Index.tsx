import { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { Header } from '@/components/Header';
import { Navigation } from '@/components/Navigation';
import { MatchesView } from '@/components/MatchesView';
import { StandingsView } from '@/components/StandingsView';
import { LeaderboardView } from '@/components/LeaderboardView';
import { ProfileView } from '@/components/ProfileView';

const Index = () => {
  const [activeTab, setActiveTab] = useState('matches');
  const location = useLocation();

  // Handle navigation state (e.g., from header profile click)
  useEffect(() => {
    if (location.state?.tab) {
      setActiveTab(location.state.tab);
      // Clear the state so it doesn't persist on refresh
      window.history.replaceState({}, document.title);
    }
  }, [location.state]);

  const renderContent = () => {
    switch (activeTab) {
      case 'matches':
        return <MatchesView />;
      case 'standings':
        return <StandingsView />;
      case 'leaderboard':
        return <LeaderboardView />;
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
