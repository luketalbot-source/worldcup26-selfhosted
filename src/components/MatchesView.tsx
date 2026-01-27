import { useState } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { MatchCard } from './MatchCard';
import { GroupTabs } from './GroupTabs';
import { StageSelector } from './StageSelector';
import { KnockoutView } from './KnockoutView';
import { SyncButton } from './SyncButton';
import { usePredictions } from '@/hooks/usePredictions';
import { useLiveMatches } from '@/hooks/useLiveMatches';
import { useAuth } from '@/contexts/AuthContext';
import { LogIn } from 'lucide-react';

const groups = ['A', 'B', 'C', 'D', 'E', 'F'];

export const MatchesView = () => {
  const [activeStage, setActiveStage] = useState<'groups' | 'knockout'>('groups');
  const [activeGroup, setActiveGroup] = useState('A');
  const { addPrediction, getPrediction } = usePredictions();
  const { getGroupMatches, syncMatches, syncing, lastSync } = useLiveMatches();
  const { user } = useAuth();
  const navigate = useNavigate();
  
  const matches = getGroupMatches(activeGroup);

  if (activeStage === 'knockout') {
    return (
      <div className="space-y-4">
        <StageSelector activeStage={activeStage} onStageChange={setActiveStage} />
        <SyncButton onSync={syncMatches} syncing={syncing} lastSync={lastSync} />
        <KnockoutView />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <StageSelector activeStage={activeStage} onStageChange={setActiveStage} />
      <SyncButton onSync={syncMatches} syncing={syncing} lastSync={lastSync} />
      
      {!user && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-accent/10 border border-accent/20 rounded-xl p-4 flex items-center justify-between"
        >
          <p className="text-sm text-foreground">
            <strong>Log in</strong> to save your predictions!
          </p>
          <button
            onClick={() => navigate('/auth')}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-accent text-accent-foreground font-semibold text-sm"
          >
            <LogIn className="w-4 h-4" />
            Log In
          </button>
        </motion.div>
      )}
      
      <div className="sticky top-[72px] bg-background z-40 py-3 -mx-4 px-4">
        <GroupTabs 
          groups={groups} 
          activeGroup={activeGroup} 
          onGroupChange={setActiveGroup} 
        />
      </div>
      
      <motion.div 
        key={activeGroup}
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.3 }}
        className="space-y-4"
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
  );
};
