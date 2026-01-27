import { useState } from 'react';
import { motion } from 'framer-motion';
import { MatchCard } from './MatchCard';
import { GroupTabs } from './GroupTabs';
import { groupStageMatches, getMatchesByGroup } from '@/data/matches';
import { usePredictions } from '@/hooks/usePredictions';

const groups = ['A', 'B', 'C', 'D', 'E', 'F'];

export const MatchesView = () => {
  const [activeGroup, setActiveGroup] = useState('A');
  const { addPrediction, getPrediction } = usePredictions();
  
  const matches = getMatchesByGroup(activeGroup);

  return (
    <div className="space-y-4">
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
          />
        ))}
      </motion.div>
    </div>
  );
};
