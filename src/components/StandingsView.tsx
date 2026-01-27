import { useState } from 'react';
import { motion } from 'framer-motion';
import { GroupTabs } from './GroupTabs';
import { GroupStandings } from './GroupStandings';
import { getTeamsByGroup } from '@/data/teams';
import { GroupStanding } from '@/types/match';

const groups = ['A', 'B', 'C', 'D', 'E', 'F'];

// Mock standings - in production, these would come from an API
const generateMockStandings = (group: string): GroupStanding[] => {
  const teams = getTeamsByGroup(group);
  return teams.map((team, index) => ({
    team,
    played: 0,
    won: 0,
    drawn: 0,
    lost: 0,
    goalsFor: 0,
    goalsAgainst: 0,
    goalDifference: 0,
    points: 0,
  }));
};

export const StandingsView = () => {
  const [activeGroup, setActiveGroup] = useState('A');
  const standings = generateMockStandings(activeGroup);

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
      >
        <GroupStandings standings={standings} group={activeGroup} />
      </motion.div>
    </div>
  );
};
