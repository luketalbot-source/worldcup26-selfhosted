import { useEffect, useState } from 'react';
import { useCompetitions } from '@/contexts/CompetitionContext';
import { SubViewSelector } from './SubViewSelector';
import { TodayFixturesSection } from './TodayFixturesSection';
import { MatchdayBrowser } from './MatchdayBrowser';
import { LeagueTable } from './LeagueTable';
import { KnockoutListView } from './KnockoutListView';
import { useLiveMatches } from '@/hooks/useLiveMatches';
import type { SubView } from '@/lib/competitionFormats';

// Shared view shell for CLUB competition formats:
//   league (Bundesliga): Today | Matchday (default) | Table
//   hybrid (Champions League): Today | Matchday (default) | Table | Knockout
// The sub-view set comes from the format profile, so this one component
// covers both — a distinct LeagueMatchesView/HybridMatchesView split would
// duplicate everything but the profile lookup.
export const ClubMatchesView = () => {
  const { activeCompetition, profile } = useCompetitions();
  const { getTodayMatches } = useLiveMatches();
  const [subView, setSubView] = useState<SubView>(profile.defaultSubView);

  // Re-anchor to the profile default when the user switches competitions
  // (a 'knockout' selection has no meaning on a pure league).
  useEffect(() => {
    setSubView(profile.defaultSubView);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCompetition?.id]);

  const todayCount = getTodayMatches().length;

  return (
    <div className="space-y-4">
      <div className="sticky top-0 bg-background z-50 pb-2 -mx-4 px-4 pt-2">
        <div className="max-w-[700px] mx-auto">
          <SubViewSelector
            subViews={profile.subViews}
            active={subView}
            onChange={setSubView}
            todayCount={todayCount}
          />
        </div>
      </div>

      {subView === 'today' && <TodayFixturesSection />}
      {subView === 'matchday' && <MatchdayBrowser />}
      {subView === 'table' && (
        <div className="max-w-[700px] mx-auto">
          <LeagueTable />
        </div>
      )}
      {subView === 'knockout' && <KnockoutListView />}
    </div>
  );
};
