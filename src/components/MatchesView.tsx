import { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { MatchCard } from './MatchCard';
import { GroupTabs } from './GroupTabs';
import { StageSelector } from './StageSelector';
import { KnockoutView, knockoutStages, type KnockoutStage } from './KnockoutView';
import { SyncButton } from './SyncButton';
import { GroupStandings } from './GroupStandings';
import { usePredictions, Prediction } from '@/hooks/usePredictions';
import { useLiveMatches } from '@/hooks/useLiveMatches';
import { useAuth } from '@/contexts/AuthContext';
import { useTenant } from '@/contexts/TenantContext';
import { getTeamsByGroup } from '@/data/teams';
import { GroupStanding, Match } from '@/types/match';
import { LogIn, Trophy } from 'lucide-react';
import mascotsWaiting from '@/assets/mascots-waiting.png';


const calculateStandings = (group: string, matches: Match[]): GroupStanding[] => {
  const teams = getTeamsByGroup(group);
  const standingsMap = new Map<string, GroupStanding>();
  
  // Initialize all teams with zero stats
  teams.forEach((team) => {
    standingsMap.set(team.id, {
      team,
      played: 0,
      won: 0,
      drawn: 0,
      lost: 0,
      goalsFor: 0,
      goalsAgainst: 0,
      goalDifference: 0,
      points: 0,
    });
  });
  
  // Process finished matches only
  const groupMatches = matches.filter(m => m.group === group && m.status === 'finished');
  
  groupMatches.forEach((match) => {
    const homeTeam = standingsMap.get(match.homeTeam.id);
    const awayTeam = standingsMap.get(match.awayTeam.id);
    
    if (!homeTeam || !awayTeam || match.homeScore === undefined || match.awayScore === undefined) return;
    
    const homeScore = match.homeScore;
    const awayScore = match.awayScore;
    
    // Update played
    homeTeam.played++;
    awayTeam.played++;
    
    // Update goals
    homeTeam.goalsFor += homeScore;
    homeTeam.goalsAgainst += awayScore;
    awayTeam.goalsFor += awayScore;
    awayTeam.goalsAgainst += homeScore;
    
    // Update goal difference
    homeTeam.goalDifference = homeTeam.goalsFor - homeTeam.goalsAgainst;
    awayTeam.goalDifference = awayTeam.goalsFor - awayTeam.goalsAgainst;
    
    // Determine winner and update W/D/L and points
    if (homeScore > awayScore) {
      homeTeam.won++;
      homeTeam.points += 3;
      awayTeam.lost++;
    } else if (awayScore > homeScore) {
      awayTeam.won++;
      awayTeam.points += 3;
      homeTeam.lost++;
    } else {
      homeTeam.drawn++;
      awayTeam.drawn++;
      homeTeam.points += 1;
      awayTeam.points += 1;
    }
  });
  
  // Convert to array and sort by points, then goal difference, then goals for
  return Array.from(standingsMap.values()).sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    if (b.goalDifference !== a.goalDifference) return b.goalDifference - a.goalDifference;
    return b.goalsFor - a.goalsFor;
  });
};
const groups = ['X', 'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'];
export const MatchesView = () => {
  const {
    t
  } = useTranslation();
  const { tenantId } = useTenant();
  const [activeStage, setActiveStage] = useState<'today' | 'groups' | 'knockout'>('groups');
  const [activeGroup, setActiveGroup] = useState('A');
  const [activeKnockoutStage, setActiveKnockoutStage] = useState<KnockoutStage>('round32');
  const {
    addPrediction,
    getPrediction,
    predictions
  } = usePredictions(tenantId);
  const {
    getGroupMatches,
    getTodayMatches,
    syncMatches,
    syncing,
    lastSync,
    canSync,
    cooldownRemaining
  } = useLiveMatches();
  const {
    user
  } = useAuth();
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
    return <motion.div initial={{
      opacity: 0,
      y: -10
    }} animate={{
      opacity: 1,
      y: 0
    }} className="bg-accent/10 border border-accent/20 rounded-xl p-4 flex items-center justify-between">
        <p className="text-sm text-foreground">
          <strong>{t('header.login')}</strong> {t('matches.loginPrompt').replace('Log in', '').trim()}
        </p>
        <button onClick={() => navigate('/auth')} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-accent text-accent-foreground font-semibold text-sm">
          <LogIn className="w-4 h-4" />
          {t('header.login')}
        </button>
      </motion.div>;
  };
  if (activeStage === 'knockout') {
    return <div className="space-y-4">
        {/* Sticky header - stage selector + knockout stage tabs on mobile */}
        <div className="sticky top-0 bg-background z-50 pb-2 -mx-4 px-4 pt-2">
          <div className="max-w-[700px] mx-auto space-y-3">
            <StageSelector activeStage={activeStage} onStageChange={setActiveStage} todayCount={todayMatches.length} />
            
            {/* Mobile: horizontal knockout stage tabs inside sticky header */}
            <div className="md:hidden">
              <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
                {knockoutStages.map(stage => <motion.button key={stage} whileHover={{
                scale: 1.05
              }} whileTap={{
                scale: 0.95
              }} onClick={() => setActiveKnockoutStage(stage)} className={`relative px-4 py-2 rounded-xl font-semibold text-sm transition-all whitespace-nowrap ${activeKnockoutStage === stage ? 'bg-fifa-coral text-white shadow-md' : 'bg-card text-muted-foreground hover:bg-muted'}`}>
                    {stage === 'finals' && <Trophy className="w-4 h-4 inline mr-1" />}
                    {t(`knockout.${stage}`)}
                  </motion.button>)}
              </div>
            </div>
          </div>
        </div>
        
        <KnockoutView 
          activeKnockoutStage={activeKnockoutStage}
          onKnockoutStageChange={setActiveKnockoutStage}
          syncButton={
            <SyncButton 
              onSync={() => syncMatches()} 
              syncing={syncing} 
              lastSync={lastSync} 
              canSync={canSync()} 
              cooldownRemaining={cooldownRemaining} 
            />
          }
        />
      </div>;
  }
  if (activeStage === 'today') {
    return <div className="space-y-4 max-w-[700px] mx-auto">
        {/* Sticky header - only stage selector */}
        <div className="sticky top-0 bg-background z-50 pb-2 -mx-4 px-4 pt-2">
          <StageSelector activeStage={activeStage} onStageChange={setActiveStage} todayCount={todayMatches.length} />
        </div>
        
        {/* Non-sticky sync button */}
        <SyncButton onSync={() => syncMatches()} syncing={syncing} lastSync={lastSync} canSync={canSync()} cooldownRemaining={cooldownRemaining} />
        
        {renderLoginPrompt()}
        
        {todayMatches.length === 0 ? <div className="text-center py-12 space-y-4">
            <img src={mascotsWaiting} alt="World Cup 2026 mascots waiting for matches" className="w-full max-w-[600px] h-auto mx-auto" />
            <p className="text-muted-foreground">{t('matches.noMatchesToday')}</p>
          </div> : <motion.div initial={{
        opacity: 0,
        x: 20
      }} animate={{
        opacity: 1,
        x: 0
      }} transition={{
        duration: 0.3
      }} className="space-y-4">
            {todayMatches.map(match => <MatchCard key={match.id} match={match} prediction={getPrediction(match.id)} onPredict={addPrediction} disabled={!user} showGroup />)}
          </motion.div>}
      </div>;
  }
  const standings = calculateStandings(activeGroup, matches);

  return <div className="space-y-4">
      {/* Sticky header - stage selector + group tabs on mobile */}
      <div className="sticky top-0 bg-background z-50 pb-2 -mx-4 px-4 pt-2">
        <div className="max-w-[700px] mx-auto space-y-3">
          <StageSelector activeStage={activeStage} onStageChange={setActiveStage} todayCount={todayMatches.length} />
          
          {/* Mobile: horizontal group tabs inside sticky header */}
          <div className="md:hidden">
            <GroupTabs groups={groups} activeGroup={activeGroup} onGroupChange={setActiveGroup} />
          </div>
        </div>
      </div>
      
      {/* Non-sticky content: sync button and login prompt */}
      <div className="max-w-[700px] mx-auto space-y-4">
        <SyncButton onSync={() => syncMatches()} syncing={syncing} lastSync={lastSync} canSync={canSync()} cooldownRemaining={cooldownRemaining} />
        {renderLoginPrompt()}
      </div>
      
      {/* Desktop: side-by-side layout */}
      <div className="gap-6 flex items-start justify-center max-w-[700px] mx-auto">
        {/* Vertical tabs - hidden on mobile */}
        <div className="hidden md:block sticky top-[120px] self-start">
          <GroupTabs groups={groups} activeGroup={activeGroup} onGroupChange={setActiveGroup} vertical />
        </div>
        
        {/* Standings + Match cards */}
        <motion.div key={activeGroup} initial={{
        opacity: 0,
        x: 20
      }} animate={{
        opacity: 1,
        x: 0
      }} transition={{
        duration: 0.3
      }} className="flex-1 space-y-4">
          <GroupStandings standings={standings} group={activeGroup} />
          {matches.map(match => <MatchCard key={match.id} match={match} prediction={getPrediction(match.id)} onPredict={addPrediction} disabled={!user} />)}
        </motion.div>
      </div>
    </div>;
};