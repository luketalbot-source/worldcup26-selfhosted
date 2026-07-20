import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { KnockoutMatchCard } from './KnockoutMatchCard';
import { useLiveMatches } from '@/hooks/useLiveMatches';
import { usePredictions } from '@/hooks/usePredictions';
import { useAuth } from '@/contexts/AuthContext';
import { useTenant } from '@/contexts/TenantContext';
import type { Match } from '@/types/match';

// CL knockout phase as a stage-grouped LIST — deliberately NOT the WC
// bracket engine. The WC bracket projects pairings from group positions
// ('1A', '3ABCDF' grammar in knockoutCalculator); the CL knockout comes
// from a seeded draw that football-data.org publishes as concrete
// fixtures, so we simply render what the API gives us, grouped by round.
// TBD pairings don't render until FD publishes them.

const STAGE_ORDER: Match['stage'][] = ['playoff', 'round16', 'quarter', 'semi', 'final'];

const STAGE_LABEL_KEY: Partial<Record<Match['stage'], string>> = {
  playoff: 'knockout.playoff',
  round16: 'knockout.round16',
  quarter: 'knockout.quarter',
  semi: 'knockout.semi',
  final: 'knockout.theFinal',
};

export const KnockoutListView = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { tenantId } = useTenant();
  const { getKnockoutListMatches } = useLiveMatches();
  const { addPrediction, getPrediction } = usePredictions(tenantId);

  const byStage = useMemo(() => {
    const groups = new Map<Match['stage'], Match[]>();
    for (const m of getKnockoutListMatches()) {
      (groups.get(m.stage) ?? groups.set(m.stage, []).get(m.stage)!).push(m);
    }
    return groups;
  }, [getKnockoutListMatches]);

  const stagesWithMatches = STAGE_ORDER.filter((s) => (byStage.get(s)?.length ?? 0) > 0);

  if (stagesWithMatches.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground max-w-[700px] mx-auto">
        {t('knockout.notDrawnYet')}
      </div>
    );
  }

  return (
    <div className="max-w-[700px] mx-auto space-y-6">
      {stagesWithMatches.map((stage) => (
        <motion.div
          key={stage}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-4"
        >
          <h3 className="font-bold text-lg text-foreground">
            {t(STAGE_LABEL_KEY[stage] ?? stage)}
          </h3>
          {byStage.get(stage)!.map((match) => (
            <KnockoutMatchCard
              key={match.id}
              match={{ ...match, bracketPosition: t(STAGE_LABEL_KEY[stage] ?? stage) }}
              prediction={getPrediction(match.id)}
              onPredict={addPrediction}
              disabled={!user}
            />
          ))}
        </motion.div>
      ))}
    </div>
  );
};
