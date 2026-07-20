import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, ChevronRight, Grid3X3 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { MatchCard } from './MatchCard';
import { KnockoutMatchCard } from './KnockoutMatchCard';
import { useLiveMatches } from '@/hooks/useLiveMatches';
import { usePredictions } from '@/hooks/usePredictions';
import { useAuth } from '@/contexts/AuthContext';
import { useTenant } from '@/contexts/TenantContext';
import type { Match } from '@/types/match';

// Matchday-first prediction browser for club competitions: a sticky
// ‹ Matchday N › pager plus a jump grid for long-range navigation across a
// 34-matchday season. Renders the standard MatchCard (quick-tap entry, lock
// logic, points) — 9 (BL1) or 18 (CL) cards per matchday is a fine scroll,
// no virtualization needed at matchday scope.
export const MatchdayBrowser = () => {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const { tenantId } = useTenant();
  const { getMatchdays, getCurrentMatchday, getMatchesByMatchday } = useLiveMatches();
  const { addPrediction, getPrediction, predictions } = usePredictions(tenantId);

  const matchdays = getMatchdays();
  const currentMatchday = getCurrentMatchday();
  const [selected, setSelected] = useState<number | null>(null);
  const [gridOpen, setGridOpen] = useState(false);

  // Land on the current matchday once fixtures resolve (and re-anchor when
  // the competition switches — matchdays identity changes).
  useEffect(() => {
    if (selected === null && currentMatchday !== null) setSelected(currentMatchday);
    if (selected !== null && matchdays.length > 0 && !matchdays.includes(selected)) {
      setSelected(currentMatchday ?? matchdays[0]!);
    }
  }, [currentMatchday, matchdays, selected]);

  const day = selected ?? currentMatchday;
  const matches = useMemo(
    () => (day !== null ? getMatchesByMatchday(day) : []),
    [day, getMatchesByMatchday],
  );

  const predictedCount = useMemo(
    () => matches.filter((m) => predictions.some((p) => p.matchId === m.id)).length,
    [matches, predictions],
  );

  // "20.–22. Juli" style range of the selected matchday's fixtures,
  // locale-aware. formatRange collapses same-month ranges neatly and a
  // single-day matchday renders as one date.
  const dateRangeLabel = useMemo(() => {
    const times = matches
      .map((m) => new Date(m.dateIso ?? m.date).getTime())
      .filter((tms) => Number.isFinite(tms));
    if (times.length === 0) return null;
    const fmt = new Intl.DateTimeFormat(i18n.language, { day: 'numeric', month: 'short' });
    const from = new Date(Math.min(...times));
    const to = new Date(Math.max(...times));
    try {
      return fmt.formatRange(from, to);
    } catch {
      // Older engines without formatRange: fall back to "from – to".
      const a = fmt.format(from);
      const b = fmt.format(to);
      return a === b ? a : `${a} – ${b}`;
    }
  }, [matches, i18n.language]);

  if (day === null || matchdays.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        {t('matchday.noFixtures')}
      </div>
    );
  }

  const idx = matchdays.indexOf(day);
  const prevDay = idx > 0 ? matchdays[idx - 1]! : null;
  const nextDay = idx < matchdays.length - 1 ? matchdays[idx + 1]! : null;

  const renderCard = (match: Match) =>
    ['group', 'regular', 'league'].includes(match.stage) ? (
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
        match={{ ...match, bracketPosition: t(`knockout.${match.stage}`, match.stage) }}
        prediction={getPrediction(match.id)}
        onPredict={addPrediction}
        disabled={!user}
      />
    );

  return (
    <div className="space-y-4">
      {/* Pager row — sticky BELOW the sub-view selector (which is sticky
          top-0 z-50 with an opaque background; same offset would occlude
          this row entirely once the page scrolls). */}
      <div className="sticky top-14 bg-background z-40 pb-2 -mx-4 px-4 pt-2">
        <div className="max-w-[700px] mx-auto flex items-center gap-2">
          <motion.button
            whileTap={{ scale: 0.9 }}
            disabled={prevDay === null}
            onClick={() => prevDay !== null && setSelected(prevDay)}
            className="p-2 rounded-xl bg-card text-muted-foreground disabled:opacity-30 hover:bg-muted"
            aria-label={t('matchday.previous')}
          >
            <ChevronLeft className="w-5 h-5" />
          </motion.button>

          <button
            onClick={() => setGridOpen((v) => !v)}
            className="flex-1 flex items-center justify-center gap-2 py-2 rounded-xl bg-card font-semibold text-foreground hover:bg-muted"
          >
            <Grid3X3 className="w-4 h-4 text-muted-foreground" />
            {t('matchday.title', { n: day })}
            {dateRangeLabel && (
              <span className="text-xs font-normal text-muted-foreground whitespace-nowrap">
                {dateRangeLabel}
              </span>
            )}
            {day === currentMatchday && (
              <span className="px-1.5 py-0.5 text-xs rounded-full bg-primary/10 text-primary font-medium">
                {t('matchday.current')}
              </span>
            )}
          </button>

          <motion.button
            whileTap={{ scale: 0.9 }}
            disabled={nextDay === null}
            onClick={() => nextDay !== null && setSelected(nextDay)}
            className="p-2 rounded-xl bg-card text-muted-foreground disabled:opacity-30 hover:bg-muted"
            aria-label={t('matchday.next')}
          >
            <ChevronRight className="w-5 h-5" />
          </motion.button>
        </div>

        {/* Jump grid */}
        <AnimatePresence>
          {gridOpen && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="max-w-[700px] mx-auto overflow-hidden"
            >
              <div className="grid grid-cols-6 sm:grid-cols-9 gap-1.5 pt-2">
                {matchdays.map((md) => (
                  <button
                    key={md}
                    onClick={() => {
                      setSelected(md);
                      setGridOpen(false);
                    }}
                    className={`py-1.5 rounded-lg text-sm font-semibold transition-all ${
                      md === day
                        ? 'bg-primary text-primary-foreground'
                        : md === currentMatchday
                          ? 'bg-primary/10 text-primary'
                          : 'bg-card text-muted-foreground hover:bg-muted'
                    }`}
                  >
                    {md}
                  </button>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Progress + fixtures */}
      <div className="max-w-[700px] mx-auto space-y-4">
        {user && matches.length > 0 && (
          <div className="flex justify-center">
            <span
              className={`px-3 py-1 rounded-full text-xs font-semibold ${
                predictedCount === matches.length
                  ? 'bg-fifa-green/10 text-fifa-green'
                  : 'bg-muted text-muted-foreground'
              }`}
            >
              {t('matchday.predictedCount', { predicted: predictedCount, total: matches.length })}
            </span>
          </div>
        )}

        <motion.div
          key={day}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.3 }}
          className="space-y-4"
        >
          {matches.map(renderCard)}
        </motion.div>
      </div>
    </div>
  );
};
