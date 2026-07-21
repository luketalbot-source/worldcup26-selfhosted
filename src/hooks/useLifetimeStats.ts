import { useEffect, useState } from 'react';
import { cachedGet } from '@/lib/requestCache';
import { boostResultIncludes } from '@/lib/boostMatch';
import { calculateUserStats, type UserStats } from '@/lib/scoringCalculator';
import { useCompetitionsSafe, isEnabled, type Competition } from '@/contexts/CompetitionContext';

// Accurate LIFETIME + per-competition stats for the profile ("Me") page.
//
// Why not reuse useUserStats? That hook scores against the LiveMatches
// context's lazily-fetched buckets, so a competition the user never opened
// is silently missing — the lifetime total undercounts. Here we fetch each
// enabled competition's matches + awards directly (competition-scoped GETs),
// so the total is correct regardless of what's been visited, and we get a
// per-game breakdown for free.
//
// Scoring reuses calculateUserStats (the canonical frontend scorer) — no new
// scoring path. Covers match predictions + standard boosts (the primary
// scoring); tenant custom boosts are out of scope for this view.

interface ApiPrediction {
  match_id: string;
  home_score: number;
  away_score: number;
}
interface ApiMatch {
  match_id: string;
  home_score: number | null;
  away_score: number | null;
  status: string;
}
interface ApiBoostAward {
  id: string;
  prediction_type: string;
  points_value: number;
}
interface ApiBoostPrediction {
  award_id: string;
  predicted_team_code: string | null;
  predicted_player_name: string | null;
}
interface ApiBoostResult {
  award_id: string;
  result_team_code: string | null;
  result_player_name: string | null;
}

export interface CompetitionStats {
  competition: Competition;
  stats: UserStats;
}

const FINISHED = new Set(['FINISHED', 'FT', 'AET', 'PEN']);
const TTL_MS = 30_000;

const EMPTY: UserStats = {
  totalPoints: 0, matchPoints: 0, boostPoints: 0,
  exactScores: 0, correctResults: 0, wrongResults: 0,
  totalPredictions: 0, accuracy: 0,
};

// Sum a set of per-competition UserStats into one lifetime figure. Accuracy
// is recomputed from the summed graded counts (a plain average of per-game
// percentages would misweight games with few predictions).
function sumStats(list: UserStats[]): UserStats {
  const s = list.reduce<UserStats>((acc, x) => ({
    totalPoints: acc.totalPoints + x.totalPoints,
    matchPoints: acc.matchPoints + x.matchPoints,
    boostPoints: acc.boostPoints + x.boostPoints,
    exactScores: acc.exactScores + x.exactScores,
    correctResults: acc.correctResults + x.correctResults,
    wrongResults: acc.wrongResults + x.wrongResults,
    totalPredictions: acc.totalPredictions + x.totalPredictions,
    accuracy: 0,
  }), { ...EMPTY });
  const graded = s.exactScores + s.correctResults + s.wrongResults;
  s.accuracy = graded > 0 ? Math.round(((s.exactScores + s.correctResults) / graded) * 100) : 0;
  return s;
}

export const useLifetimeStats = (userId: string | undefined, tenantId?: string | null) => {
  const ctx = useCompetitionsSafe();
  // Score every game the tenant can play (enabled), highest display_order
  // first so the breakdown reads active-games-first, archive last.
  const competitions = (ctx?.competitions ?? [])
    .filter(isEnabled)
    .slice()
    .sort((a, b) => b.display_order - a.display_order);
  const compKey = competitions.map((c) => c.id).join(',');

  const [byCompetition, setByCompetition] = useState<CompetitionStats[]>([]);
  const [lifetime, setLifetime] = useState<UserStats>(EMPTY);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) {
      setByCompetition([]);
      setLifetime(EMPTY);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);

    const tenantParam: Record<string, string | undefined> = tenantId ? { tenant_id: tenantId } : {};

    void (async () => {
      try {
        // Tenant-wide once (predictions/boosts carry no competition_id — they
        // resolve to a game via the match / award), then per-competition.
        const [allPredictions, boostPredictions, boostResults] = await Promise.all([
          cachedGet<ApiPrediction[]>('/predictions', { params: tenantParam, ttlMs: TTL_MS }),
          cachedGet<ApiBoostPrediction[]>('/boosts/predictions', { params: tenantParam, ttlMs: TTL_MS }),
          cachedGet<ApiBoostResult[]>('/boosts/results', { ttlMs: TTL_MS }),
        ]);

        const perComp = await Promise.all(
          competitions.map(async (comp): Promise<CompetitionStats> => {
            const [matches, awards] = await Promise.all([
              cachedGet<ApiMatch[]>(`/matches?competition=${encodeURIComponent(comp.slug)}`, { ttlMs: TTL_MS }),
              cachedGet<ApiBoostAward[]>(`/boosts/awards?competition=${encodeURIComponent(comp.slug)}`, { ttlMs: TTL_MS }),
            ]);

            // Match scoring: keep only this game's predictions (those whose
            // match_id belongs to this competition) and its finished results.
            const matchIds = new Set((matches ?? []).map((m) => m.match_id));
            const results = new Map<string, { home_score: number | null; away_score: number | null }>();
            for (const m of matches ?? []) {
              if (FINISHED.has(m.status)) results.set(m.match_id, { home_score: m.home_score, away_score: m.away_score });
            }
            const predictions = (allPredictions ?? []).filter((p) => matchIds.has(p.match_id));

            // Boost scoring: this game's awards, the user's predictions for
            // them, graded against the global results set.
            const awardById = new Map((awards ?? []).map((a) => [a.id, a]));
            const compBoostPreds = (boostPredictions ?? []).filter((bp) => awardById.has(bp.award_id));
            let boostPoints = 0;
            for (const bp of compBoostPreds) {
              const award = awardById.get(bp.award_id)!;
              const result = (boostResults ?? []).find((r) => r.award_id === bp.award_id);
              if (!result) continue;
              const hit = award.prediction_type === 'team'
                ? boostResultIncludes(result.result_team_code, bp.predicted_team_code)
                : boostResultIncludes(result.result_player_name, bp.predicted_player_name);
              if (hit) boostPoints += award.points_value;
            }

            const totalPredictionCount = predictions.length + compBoostPreds.length;
            const stats = calculateUserStats(predictions, results, boostPoints, totalPredictionCount);
            return { competition: comp, stats };
          }),
        );

        if (cancelled) return;
        setByCompetition(perComp);
        setLifetime(sumStats(perComp.map((x) => x.stats)));
      } catch (err) {
        console.error('useLifetimeStats: fetch failed:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, tenantId, compKey]);

  return { lifetime, byCompetition, loading };
};
