import { useState } from 'react';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { MatchCard } from './MatchCard';
import { KnockoutMatchCard } from './KnockoutMatchCard';
import { usePredictions } from '@/hooks/usePredictions';
import { useLiveMatches, type MatchDayFilter } from '@/hooks/useLiveMatches';
import { useAuth } from '@/contexts/AuthContext';
import { useTenant } from '@/contexts/TenantContext';
import type { Match } from '@/types/match';
import emptyStateTodayDark from '@/assets/empty-state-today-dark.jpg';
import emptyStateTodayLight from '@/assets/empty-state-today-light.jpg';

// Today fixtures for CLUB competition views (league/hybrid) — same
// date-window pills + card list as the tournament view's Today tab, reusing
// the same hooks. The tournament view keeps its own inline implementation
// untouched (archive safety); this is the club-format counterpart.

const dayFilters: MatchDayFilter[] = ['past', 'yesterday', 'today', 'tomorrow', 'future'];

const REGULAR_STAGES = new Set<Match['stage']>(['group', 'regular', 'league']);

const KO_LABEL_KEY: Partial<Record<Match['stage'], string>> = {
  playoff: 'knockout.playoff',
  round32: 'knockout.round32',
  round16: 'knockout.round16',
  quarter: 'knockout.quarter',
  semi: 'knockout.semi',
  third: 'knockout.thirdPlace',
  final: 'knockout.theFinal',
};

export const TodayFixturesSection = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { tenantId } = useTenant();
  const { getTodayMatches } = useLiveMatches();
  const { addPrediction, getPrediction } = usePredictions(tenantId);
  const [activeDayFilter, setActiveDayFilter] = useState<MatchDayFilter>('today');

  const matches = getTodayMatches(activeDayFilter);

  return (
    <div className="max-w-[700px] mx-auto space-y-4">
      <div className="grid grid-cols-5 gap-1.5 sm:gap-2">
        {dayFilters.map((filter) => (
          <motion.button
            key={filter}
            whileTap={{ scale: 0.95 }}
            onClick={() => setActiveDayFilter(filter)}
            className={`px-1 py-2 rounded-xl font-semibold text-xs sm:text-sm text-center transition-all ${
              activeDayFilter === filter
                ? 'bg-fifa-coral text-white shadow-md'
                : 'bg-card text-muted-foreground hover:bg-muted'
            }`}
          >
            {t(`matches.dayFilter.${filter}`)}
          </motion.button>
        ))}
      </div>

      {matches.length === 0 ? (
        <div className="text-center py-12 space-y-4">
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
        </div>
      ) : (
        <motion.div
          key={activeDayFilter}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.3 }}
          className="space-y-4"
        >
          {matches.map((match) =>
            REGULAR_STAGES.has(match.stage) ? (
              <MatchCard
                key={match.id}
                match={match}
                prediction={getPrediction(match.id)}
                onPredict={addPrediction}
                disabled={!user}
              />
            ) : (
              <KnockoutMatchCard
                key={match.id}
                match={{ ...match, bracketPosition: t(KO_LABEL_KEY[match.stage] ?? match.stage) }}
                prediction={getPrediction(match.id)}
                onPredict={addPrediction}
                disabled={!user}
              />
            ),
          )}
        </motion.div>
      )}
    </div>
  );
};
