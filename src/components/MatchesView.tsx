import { useCompetitionsSafe } from '@/contexts/CompetitionContext';
import { TournamentMatchesView } from './TournamentMatchesView';
import { ClubMatchesView } from './ClubMatchesView';

// Thin format router. The ACTIVE competition's format decides the view
// composition:
//   tournament (WC archive) → the exact pre-multi-competition view
//     (today | groups A–L | knockout bracket), untouched code paths.
//   league / hybrid (Bundesliga, Champions League) → ClubMatchesView
//     (today | matchday | table [| knockout list]).
// Without a CompetitionProvider (defensive) it falls back to the
// tournament view — identical to the single-competition era.
export const MatchesView = () => {
  const ctx = useCompetitionsSafe();
  const format = ctx?.activeCompetition?.format ?? 'tournament';

  if (format === 'league' || format === 'hybrid') return <ClubMatchesView />;
  return <TournamentMatchesView />;
};
