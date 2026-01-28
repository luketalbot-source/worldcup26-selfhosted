import { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { MatchCard } from './MatchCard';
import { GroupTabs } from './GroupTabs';
import { StageSelector } from './StageSelector';
import { KnockoutView } from './KnockoutView';
import { SyncButton } from './SyncButton';
import { usePredictions, Prediction } from '@/hooks/usePredictions';
import { useLiveMatches } from '@/hooks/useLiveMatches';
import { useAuth } from '@/contexts/AuthContext';
import { LogIn } from 'lucide-react';
import mascotsWaiting from '@/assets/mascots-waiting.png';

const groups = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'];

export const MatchesView = () => {
  const { t } = useTranslation();
  const [activeStage, setActiveStage] = useState<'today' | 'groups' | 'knockout'>('today');
  const [activeGroup, setActiveGroup] = useState('A');
  const { addPrediction, getPrediction, predictions } = usePredictions();
  const { getGroupMatches, getTodayMatches, syncMatches, syncing, lastSync, canSync, cooldownRemaining } = useLiveMatches();
  const { user } = useAuth();
  const navigate = useNavigate();
  
  const matches = getGroupMatches(activeGroup);
  const todayMatches = getTodayMatches();
  
  // Convert predictions array to Record for component
  const predictionsRecord = useMemo(() => {
    return predictions.reduce((acc, p) => {
      acc[p.matchId] = p;
      return acc;
    }, {} as Record<string, Prediction>);
  }, [predictions]);

  const renderLoginPrompt = () => {
    if (user) return null;
    return (
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-accent/10 border border-accent/20 rounded-xl p-4 flex items-center justify-between"
      >
        <p className="text-sm text-foreground">
          <strong>{t('header.login')}</strong> {t('matches.loginPrompt').replace('Log in', '').trim()}
        </p>
        <button
          onClick={() => navigate('/auth')}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-accent text-accent-foreground font-semibold text-sm"
        >
          <LogIn className="w-4 h-4" />
          {t('header.login')}
        </button>
      </motion.div>
    );
  };

  if (activeStage === 'knockout') {
    return (
      <div className="space-y-4">
        <StageSelector activeStage={activeStage} onStageChange={setActiveStage} todayCount={todayMatches.length} />
        <SyncButton onSync={() => syncMatches()} syncing={syncing} lastSync={lastSync} canSync={canSync()} cooldownRemaining={cooldownRemaining} />
        <KnockoutView />
      </div>
    );
  }

  if (activeStage === 'today') {
    return (
      <div className="space-y-4">
        <StageSelector activeStage={activeStage} onStageChange={setActiveStage} todayCount={todayMatches.length} />
        <SyncButton onSync={() => syncMatches()} syncing={syncing} lastSync={lastSync} canSync={canSync()} cooldownRemaining={cooldownRemaining} />
        
        {renderLoginPrompt()}
        
        {todayMatches.length === 0 ? (
          <div className="text-center py-12 space-y-4">
            <img 
              src={mascotsWaiting} 
              alt="World Cup 2026 mascots waiting for matches" 
              className="w-full max-w-[600px] h-auto mx-auto"
            />
            <p className="text-muted-foreground">{t('matches.noMatchesToday')}</p>
          </div>
        ) : (
          <motion.div 
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.3 }}
            className="space-y-4 max-w-[700px] mx-auto"
          >
            {todayMatches.map((match) => (
              <MatchCard
                key={match.id}
                match={match}
                prediction={getPrediction(match.id)}
                onPredict={addPrediction}
                disabled={!user}
              />
            ))}
          </motion.div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <StageSelector activeStage={activeStage} onStageChange={setActiveStage} todayCount={todayMatches.length} />
      <SyncButton onSync={() => syncMatches()} syncing={syncing} lastSync={lastSync} canSync={canSync()} cooldownRemaining={cooldownRemaining} />
      
      {renderLoginPrompt()}
      
      {/* Mobile: horizontal tabs */}
      <div className="md:hidden sticky top-[72px] bg-background z-40 py-3 -mx-4 px-4">
        <GroupTabs 
          groups={groups} 
          activeGroup={activeGroup} 
          onGroupChange={setActiveGroup} 
        />
      </div>
      
      {/* Desktop: side-by-side layout */}
      <div className="flex gap-6">
        {/* Vertical tabs - hidden on mobile */}
        <div className="hidden md:block sticky top-[120px] self-start">
          <GroupTabs 
            groups={groups} 
            activeGroup={activeGroup} 
            onGroupChange={setActiveGroup}
            vertical
          />
        </div>
        
        {/* Match cards */}
        <motion.div 
          key={activeGroup}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.3 }}
          className="flex-1 space-y-4 max-w-[700px]"
        >
          {matches.map((match) => (
            <MatchCard
              key={match.id}
              match={match}
              prediction={getPrediction(match.id)}
              onPredict={addPrediction}
              disabled={!user}
            />
          ))}
        </motion.div>
      </div>
    </div>
  );
};
