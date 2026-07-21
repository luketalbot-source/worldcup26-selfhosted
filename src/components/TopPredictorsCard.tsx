import { motion } from 'framer-motion';
import { Medal } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useCompetitionsSafe } from '@/contexts/CompetitionContext';
import { useTenant } from '@/contexts/TenantContext';
import { useLeaderboard } from '@/hooks/useLeaderboard';

// "Top 3 Predictors" podium for a COMPLETED competition — sits under the
// champions card on the Stats page. Data is the per-game Everyone
// leaderboard (same endpoint/scoping as Leagues → Everyone), so the podium
// here always agrees with the leaderboard tab. Renders nothing while the
// game is still running or when nobody has scored yet.

// Podium-medal tints — keep in sync with RANK_STYLES in StatsView.tsx
// (not imported to avoid a circular module edge; it's a 3-line token set).
const RANK_STYLES = [
  'bg-amber-400 text-amber-900',
  'bg-slate-300 text-slate-700 dark:bg-slate-200 dark:text-slate-800',
  'bg-orange-700/70 text-orange-100',
];

export const TopPredictorsCard = () => {
  const { t } = useTranslation();
  const ctx = useCompetitionsSafe();
  const { tenantId } = useTenant();
  const comp = ctx?.activeCompetition ?? null;
  const isCompleted = comp ? comp.is_active === false : false;

  // Passing null skips the fetch entirely (running games never hit the API).
  const { leaderboard } = useLeaderboard(
    isCompleted && tenantId && comp ? { tenantId, competitionId: comp.id } : null,
  );

  if (!isCompleted) return null;
  const top3 = leaderboard.filter((e) => e.points > 0).slice(0, 3);
  if (top3.length === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <h3 className="text-xs uppercase tracking-widest text-muted-foreground font-semibold mb-2 px-1">
        <Medal className="w-3.5 h-3.5 inline mr-1 -mt-0.5" />
        {t('stats.topPredictors.title')}
      </h3>
      <div className="bg-card rounded-2xl shadow-card border border-border/50 divide-y divide-border/50 overflow-hidden">
        {top3.map((entry) => (
          <div key={entry.userId} className="px-4 py-3 flex items-center gap-3">
            {/* Medal tint keyed on the SERVER rank, not the array index —
                a tie gives ranks 1,1,3 and both firsts must be gold. */}
            <div
              className={`w-7 h-7 rounded-full font-extrabold text-sm flex items-center justify-center shrink-0 ${
                RANK_STYLES[entry.rank - 1] ?? 'bg-muted text-muted-foreground'
              }`}
            >
              {entry.rank}
            </div>
            <span className="text-xl shrink-0">{entry.avatarEmoji}</span>
            <div className="flex-1 min-w-0">
              {/* translate="no": user names must never be machine-translated
                  (see the ProfileView note — Chrome once "translated" one). */}
              <div className="font-semibold truncate text-foreground" translate="no">
                {entry.displayName}
              </div>
              <div className="text-xs text-muted-foreground truncate">
                {/* `n`, not `count` — count triggers i18next plural-suffix
                    resolution (key_one/key_other), which these keys don't ship.
                    Pens segment only when nonzero, so the line always
                    reconciles: 3·exact + results + pens + boosts = points. */}
                {t('stats.topPredictors.exact', { n: entry.exactCount })}
                {' · '}
                {t('stats.topPredictors.results', { n: entry.correctCount })}
                {entry.pensPoints > 0 && (
                  <>
                    {' · '}
                    {t('stats.topPredictors.pens', { n: entry.pensPoints })}
                  </>
                )}
                {' · '}
                {t('stats.topPredictors.boosts', { n: entry.boostPoints })}
              </div>
            </div>
            <div className="text-right shrink-0">
              <div className="text-xl font-extrabold tabular-nums text-foreground">{entry.points}</div>
              <div className="text-[10px] uppercase text-muted-foreground -mt-0.5">
                {t('profile.pointsShort')}
              </div>
            </div>
          </div>
        ))}
      </div>
    </motion.div>
  );
};
