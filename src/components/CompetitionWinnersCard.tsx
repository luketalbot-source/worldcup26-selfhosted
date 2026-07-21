import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Trophy } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cachedGet } from '@/lib/requestCache';
import { useCompetitionsSafe } from '@/contexts/CompetitionContext';
import { useTeams } from '@/hooks/useTeams';
import { Flag } from '@/components/Flag';

// Capstone card at the top of the Stats page for a COMPLETED competition:
// who won it. Champion comes from the 'winners' boost-award result (the
// admin-set "which team won this competition"); the golden-boot result adds
// the top scorer. Renders nothing until the competition is archived AND a
// champion has been recorded — so it never shows mid-season.

interface Award {
  id: string;
  slug: string;
  prediction_type: string;
}
interface Result {
  award_id: string;
  result_team_code: string | null;
  result_player_name: string | null;
}

export const CompetitionWinnersCard = () => {
  const { t } = useTranslation();
  const ctx = useCompetitionsSafe();
  const comp = ctx?.activeCompetition ?? null;
  const isCompleted = comp ? comp.is_active === false : false;
  const teamKind = ctx?.profile.teamKind ?? 'country';
  // Roster only needed to turn the champion's code into a name + crest.
  const { teams } = useTeams(isCompleted ? comp?.slug : undefined);

  const [champCode, setChampCode] = useState<string | null>(null);
  const [topScorer, setTopScorer] = useState<string | null>(null);

  useEffect(() => {
    if (!isCompleted || !comp) {
      setChampCode(null);
      setTopScorer(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const [awards, results] = await Promise.all([
          cachedGet<Award[]>(`/boosts/awards?competition=${encodeURIComponent(comp.slug)}`, { ttlMs: 60_000 }),
          cachedGet<Result[]>('/boosts/results', { ttlMs: 60_000 }),
        ]);
        const resultByAward = new Map((results ?? []).map((r) => [r.award_id, r]));
        const winners = (awards ?? []).find((a) => a.slug === 'winners');
        const golden = (awards ?? []).find((a) => a.slug === 'golden-boot');
        // The 'winners' result can be a CSV of tied teams — take the first.
        const champ = winners ? resultByAward.get(winners.id)?.result_team_code ?? null : null;
        const first = champ ? champ.split(',')[0].trim() : null;
        const scorer = golden ? resultByAward.get(golden.id)?.result_player_name ?? null : null;
        if (!cancelled) {
          setChampCode(first || null);
          setTopScorer(scorer || null);
        }
      } catch {
        /* leave unset → card stays hidden */
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCompleted, comp?.slug]);

  if (!isCompleted || !champCode) return null;

  const champ = teams.find((tm) => tm.code === champCode);
  const champName = champ?.name ?? champCode;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl shadow-card border border-fifa-gold/30 overflow-hidden bg-gradient-to-br from-fifa-gold/15 to-transparent"
    >
      <div className="p-5 flex items-center gap-4">
        <div className="w-12 h-12 rounded-xl bg-fifa-gold/20 flex items-center justify-center shrink-0">
          <Trophy className="w-6 h-6 text-fifa-gold" />
        </div>
        <div className="min-w-0">
          <div className="text-[11px] uppercase tracking-widest text-fifa-gold font-semibold">
            {t('stats.winners.title', 'Champions')}
          </div>
          <div className="flex items-center gap-2 mt-1">
            <Flag code={champCode} crestUrl={champ?.crestUrl} kind={teamKind} className="w-6" />
            <span className="text-xl font-extrabold text-foreground truncate">{champName}</span>
          </div>
          {topScorer && (
            <div className="text-sm text-muted-foreground mt-1">
              {t('stats.winners.topScorer', 'Top scorer')}:{' '}
              <span className="text-foreground font-medium">{topScorer}</span>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
};
