import { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { MatchCard } from './MatchCard';
import { KnockoutMatchCard } from './KnockoutMatchCard';
import { GroupTabs } from './GroupTabs';
import { StageSelector } from './StageSelector';
import { KnockoutView, knockoutStages, type KnockoutStage } from './KnockoutView';
import { SyncButton } from './SyncButton';
import { GroupStandings } from './GroupStandings';
import { usePredictions, Prediction } from '@/hooks/usePredictions';
import { useLiveMatches, type MatchDayFilter } from '@/hooks/useLiveMatches';
import { useTeams } from '@/hooks/useTeams';
import { useGroupFixtures } from '@/hooks/useGroupFixtures';
import { useAuth } from '@/contexts/AuthContext';
import { useTenant } from '@/contexts/TenantContext';
import { GroupStanding, Match, Team } from '@/types/match';
import { LogIn, Trophy } from 'lucide-react';
import emptyStateTodayDark from '@/assets/empty-state-today-dark.jpg';
import emptyStateTodayLight from '@/assets/empty-state-today-light.jpg';


const calculateStandings = (group: string, matches: Match[], teams: Team[]): GroupStanding[] => {
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
const groups = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'];
// Day-window pills shown on the Today tab, BBC-fixtures style. Order is
// chronological left→right; 'today' is the default selection. The tab
// itself keeps its "Today" label — these just widen what it can show.
const dayFilters: MatchDayFilter[] = ['past', 'yesterday', 'today', 'tomorrow', 'future'];
// Knockout fixtures surface in the Today tab once the bracket starts (most
// users predict from Today, not the separate Knockout tab). They MUST render
// with KnockoutMatchCard — the plain MatchCard has no penalty-shootout
// predictor, so a KO game shown here would silently lose the pens feature.
// Maps the match stage to the round label the knockout card shows top-left.
const KO_STAGE_LABEL_KEY: Record<Exclude<Match['stage'], 'group'>, string> = {
  round32: 'knockout.round32',
  round16: 'knockout.round16',
  quarter: 'knockout.quarter',
  semi: 'knockout.semi',
  third: 'knockout.thirdPlace',
  final: 'knockout.theFinal',
};
export const MatchesView = () => {
  const {
    t
  } = useTranslation();
  const { tenantId } = useTenant();
  // Default to the Today tab — during the tournament it's the most
  // relevant landing view (today's fixtures + live scores). Pre-tournament
  // it shows its own empty state, which is fine.
  const [activeStage, setActiveStage] = useState<'today' | 'groups' | 'knockout'>('today');
  const [activeGroup, setActiveGroup] = useState('A');
  const [activeKnockoutStage, setActiveKnockoutStage] = useState<KnockoutStage>('round32');
  const [activeDayFilter, setActiveDayFilter] = useState<MatchDayFilter>('today');
  const {
    addPrediction,
    getPrediction,
    predictions
  } = usePredictions(tenantId);
  const {
    getTodayMatches,
    syncMatches,
    syncing,
    lastSync,
    canSync,
    cooldownRemaining
  } = useLiveMatches();
  const { getTeamsByGroup } = useTeams();
  const { matches: apiGroupMatches, getMatchesByGroup, refetch: refetchFixtures } = useGroupFixtures();
  const {
    user
  } = useAuth();
  const navigate = useNavigate();
  // Group-stage fixtures come from the API (populated by sync-matches) so the
  // Group X test data is gone and the full 48-team roster is live.
  const matches = getMatchesByGroup(activeGroup);
  // The StageSelector badge always shows TODAY's count, independent of
  // which day-window pill is selected below it.
  const todayMatches = getTodayMatches();
  const dayFilterMatches = activeDayFilter === 'today' ? todayMatches : getTodayMatches(activeDayFilter);

  // Kick off a fixture refetch after a successful admin sync so the UI
  // reflects what the backend just pulled from football-data.org.
  const handleSyncAndRefresh = async () => {
    await syncMatches();
    await refetchFixtures();
  };

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
              onSync={() => handleSyncAndRefresh()} 
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
        {/* Sticky header - stage selector + day-window pills */}
        <div className="sticky top-0 bg-background z-50 pb-2 -mx-4 px-4 pt-2">
          <div className="space-y-3">
            <StageSelector activeStage={activeStage} onStageChange={setActiveStage} todayCount={todayMatches.length} />
            {/* Day filters, BBC-fixtures style. A 5-column grid rather
                than a scroll row: pills always fill the container width
                edge-to-edge (no horizontal overflow on narrow phones, no
                odd left-aligned cluster on desktop). Labels are short in
                every locale; text-xs on mobile keeps the longest ones
                (Yesterday / Gestern) inside a fifth of a 360px viewport. */}
            <div className="grid grid-cols-5 gap-1.5 sm:gap-2">
              {dayFilters.map(filter => <motion.button key={filter} whileTap={{
                scale: 0.95
              }} onClick={() => setActiveDayFilter(filter)} className={`px-1 py-2 rounded-xl font-semibold text-xs sm:text-sm text-center transition-all ${activeDayFilter === filter ? 'bg-fifa-coral text-white shadow-md' : 'bg-card text-muted-foreground hover:bg-muted'}`}>
                  {t(`matches.dayFilter.${filter}`)}
                </motion.button>)}
            </div>
          </div>
        </div>

        {/* Non-sticky sync button */}
        <SyncButton onSync={() => handleSyncAndRefresh()} syncing={syncing} lastSync={lastSync} canSync={canSync()} cooldownRemaining={cooldownRemaining} />

        {renderLoginPrompt()}

        {dayFilterMatches.length === 0 ? <div className="text-center py-12 space-y-4">
            {/* Two real assets — dark-on-black for dark mode, light-on-white
                for light mode — instead of relying on CSS invert. Slightly
                more bytes (40KB total vs ~20KB) but the light version's
                contrast is properly tuned, not just a numerical channel
                flip. Tailwind's dark: variant toggles which is shown. */}
            <img
              src={emptyStateTodayLight}
              alt=""
              aria-hidden="true"
              loading="lazy"
              decoding="async"
              className="w-full max-w-[400px] h-auto mx-auto rounded-2xl shadow-card block dark:hidden"
            />
            <img
              src={emptyStateTodayDark}
              alt=""
              aria-hidden="true"
              loading="lazy"
              decoding="async"
              className="w-full max-w-[400px] h-auto mx-auto rounded-2xl shadow-card hidden dark:block"
            />
            <p className="text-muted-foreground">{t(`matches.noMatchesFor.${activeDayFilter}`)}</p>
          </div> : <motion.div key={activeDayFilter} initial={{
        opacity: 0,
        x: 20
      }} animate={{
        opacity: 1,
        x: 0
      }} transition={{
        duration: 0.3
      }} className="space-y-4">
            {dayFilterMatches.map(match => match.stage === 'group' ? (
              <MatchCard key={match.id} match={match} prediction={getPrediction(match.id)} onPredict={addPrediction} disabled={!user} showGroup />
            ) : (
              <KnockoutMatchCard
                key={match.id}
                match={{ ...match, bracketPosition: t(KO_STAGE_LABEL_KEY[match.stage]) }}
                prediction={getPrediction(match.id)}
                onPredict={addPrediction}
                disabled={!user}
              />
            ))}
          </motion.div>}
      </div>;
  }
  const standings = calculateStandings(activeGroup, matches, getTeamsByGroup(activeGroup));

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
        <SyncButton onSync={() => handleSyncAndRefresh()} syncing={syncing} lastSync={lastSync} canSync={canSync()} cooldownRemaining={cooldownRemaining} />
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