// "Matchday Update" — the tournament-wide stats tab.
//
// Lives behind the `tournamentStarted` gate in <Navigation>: the nav
// item doesn't render until the opening fixture has kicked off. By the
// time this view mounts, at least one match is in progress — but goals
// might not yet exist, hence the explicit empty state below.
//
// Pulls everything from a single endpoint (GET /api/stats/tournament)
// so re-paint on a goal SSE is one fetch, not five. SSE itself isn't
// wired here yet — we refetch on mount and (debounced 3s) after goals
// celebrated by LiveMatchesContext, which is plenty fresh for a stats
// roll-up that nobody will be watching second-by-second.
//
// Visual reference: /tmp/matchday-update.html "Variant A". Layout is
// 1:1 with the mockup; copy lives in i18n for the 14-language rollout.

import { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';
import { api, ApiError } from '@/lib/apiClient';
import { useLiveMatchesContext } from '@/contexts/LiveMatchesContext';
import { Flag } from './Flag';

interface TopScorer {
  player_name: string;
  team_code: string;
  team_name: string;
  goals: number;
}

interface TeamGoals {
  team_code: string;
  team_name: string;
  goals: number;
}

interface CleanSheet {
  team_code: string;
  team_name: string;
  count: number;
}

interface BiggestWin {
  match_id: string;
  home_team_code: string;
  home_team_name: string;
  away_team_code: string;
  away_team_name: string;
  home_score: number;
  away_score: number;
  margin: number;
  stage: string;
  group_name: string | null;
}

interface FastestGoal {
  player_name: string;
  team_code: string;
  team_name: string;
  minute: number;
  match_id: string;
  opponent_code: string;
  opponent_name: string;
}

interface WorstDiscipline {
  team_code: string;
  team_name: string;
  yellow: number;
  second_yellow: number;
  red: number;
  total_cards: number;
  score: number;
}

interface TournamentStats {
  totals: {
    goals: number;
    matches_played: number;
    matches_scheduled: number;
    per_match: number;
    yellow_cards: number;
    red_cards: number;
    // Phase 2 — cards per match (rolling average). May be absent on
    // older API responses if the user has a stale tab open during a
    // deploy; default to 0 in the consumer.
    cards_per_match?: number;
  };
  top_scorers: TopScorer[];
  team_goals: TeamGoals[];
  clean_sheets: CleanSheet[];
  biggest_win: BiggestWin | null;
  fastest_goal: FastestGoal | null;
  // Phase 2. null when no bookings have been recorded yet.
  worst_discipline?: WorstDiscipline | null;
}

// Stage values as they're stored in live_matches.stage (set by
// mapStage() in admin.ts). Earlier these used "round_of_32" /
// "quarter_final" / etc. — a hangover from the FD enum names — which
// silently mismatched the DB, so the stage-detection walk only ever
// matched 'group' and 'final' and reported "FINAL" the moment fixtures
// loaded. Keep these as the authoritative ordering and the i18n keys
// MUST mirror them 1:1.
const STAGE_ORDER = [
  'group',
  'round32',
  'round16',
  'quarter',
  'semi',
  'third',
  'final',
] as const;

// Podium-medal tints for ranks 1/2/3 in the top-scorer list. Anything
// after 3rd gets the muted "rest of pack" token.
const RANK_STYLES = [
  'bg-amber-400 text-amber-900',
  'bg-slate-300 text-slate-700 dark:bg-slate-200 dark:text-slate-800',
  'bg-orange-700/70 text-orange-100',
];

export const StatsView = () => {
  const { t } = useTranslation();
  const { matches, goalQueue } = useLiveMatchesContext();
  const [stats, setStats] = useState<TournamentStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Re-trigger fetch on every goal celebrated by the global context so
  // a scorer's name appears here shortly after the goal popup dismisses.
  // We key off goalQueue.length which monotonically grows while a goal
  // is queued — cheap to track without a custom event. Goal-driven
  // refetches are debounced 3s: a multi-goal score correction emits
  // several SSE events back-to-back, and without the debounce each one
  // fired its own /stats/tournament request — multiplied by every
  // connected client.
  const goalTick = goalQueue.length;
  const hasFetchedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    let timer: number | undefined;
    const load = async () => {
      try {
        setError(null);
        const data = await api.get<TournamentStats>('/stats/tournament');
        if (!cancelled) setStats(data);
      } catch (e) {
        if (!cancelled) {
          // Surface ApiError detail when present; otherwise fall back
          // to a generic copy. Either way, the empty-state UI is fine
          // to keep showing — we just won't have live numbers.
          setError(e instanceof ApiError ? e.message : 'load_failed');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    if (!hasFetchedRef.current) {
      // First load on mount — fetch immediately.
      hasFetchedRef.current = true;
      void load();
    } else {
      // Goal-driven refetch — wait out the burst, then fetch once. A new
      // tick before the timer fires clears it via cleanup and re-arms.
      timer = window.setTimeout(() => void load(), 3000);
    }
    return () => {
      cancelled = true;
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [goalTick]);

  // Tick `now` once a minute so kick-off-time-based derivations (which
  // stage are we in, has anything started yet) advance on their own
  // without a manual refresh — the tab is open for long stretches.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  // Has the tournament actually kicked off? Defined by data: at least
  // one match's kickoff time has elapsed. (The Nav-tab gate is looser
  // — it just checks fixtures-loaded — but the hero copy and stage
  // headline care about kickoff, not fixture-availability.)
  const anyMatchStarted = useMemo(
    () => matches.some((m) => new Date(m.match_date).getTime() <= now),
    [matches, now],
  );

  // Headline tournament stage. We can't just take the furthest stage
  // that appears in `matches` — every fixture is in the table from day
  // one, so that'd report "Final" before kick-off. Two rules instead:
  //   - If anything has started: highest stage among matches that have
  //     started (in-progress or finished).
  //   - Pre-kickoff: earliest unplayed stage, i.e. group stage at the
  //     beginning, then round32 once group is done, etc.
  const currentStage = useMemo(() => {
    if (matches.length === 0) return 'group';
    const startedStages = new Set(
      matches
        .filter((m) => new Date(m.match_date).getTime() <= now)
        .map((m) => m.stage),
    );
    if (startedStages.size > 0) {
      let best = 'group';
      for (const s of STAGE_ORDER) {
        if (startedStages.has(s)) best = s;
      }
      return best;
    }
    // Nothing has kicked off — walk forwards through STAGE_ORDER and
    // pick the FIRST stage that still has unplayed fixtures. Stable
    // across reloads, no dependency on per-row status.
    const remaining = new Set(matches.map((m) => m.stage));
    for (const s of STAGE_ORDER) {
      if (remaining.has(s)) return s;
    }
    return 'group';
  }, [matches, now]);

  if (loading && !stats) {
    return (
      <div className="space-y-4 max-w-[700px] mx-auto">
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  // No stats payload at all — show empty state. Treats network failure
  // the same as "endpoint returned no goals yet" because the user
  // experience is identical: there's nothing to see, here's what's
  // coming.
  const hasAnyGoals = (stats?.totals.goals ?? 0) > 0;
  const matchesPlayed = stats?.totals.matches_played ?? 0;
  const matchesScheduled = stats?.totals.matches_scheduled ?? matches.length;

  // Three header states, ordered by how much data we have to show:
  //   - 'preKickoff' — fixtures loaded but no match has started yet
  //   - 'liveNoGoals' — at least one match has kicked off, no goals yet
  //   - 'underway' — we have goals, show the rolling summary
  // Each state has its own title + subtitle key so translators can
  // reword tone per locale (e.g. "Coming up" framing in German etc.).
  const heroState: 'preKickoff' | 'liveNoGoals' | 'underway' = hasAnyGoals
    ? 'underway'
    : anyMatchStarted
      ? 'liveNoGoals'
      : 'preKickoff';

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-4 max-w-[700px] mx-auto"
    >
      {/* Header card — same gradient feel as the Profile header so
          the user gets a consistent "this is a destination" cue across
          tabs that aren't pure lists. */}
      <div className="bg-card rounded-2xl shadow-card border border-border/50 overflow-hidden">
        <div className="gradient-navy px-5 pt-6 pb-5">
          <div className="text-[11px] uppercase tracking-widest text-white/70 font-semibold mb-1">
            ⚡ {t('stats.title')}
            <span className="text-white/30 mx-2">·</span>
            <span className="text-white/80">{t(`stats.stage.${currentStage}`)}</span>
          </div>
          <h2 className="text-2xl font-extrabold text-white">
            {t(`stats.hero.${heroState}.title`)}
          </h2>
          <p className="text-sm text-white/70 mt-1">
            {heroState === 'underway'
              ? t('stats.hero.underway.subtitle', {
                  played: matchesPlayed,
                  remaining: Math.max(matchesScheduled - matchesPlayed, 0),
                })
              : t(`stats.hero.${heroState}.subtitle`)}
          </p>
        </div>

        {/* Hero metrics — three across; dim out when there's nothing
            to show so the page reads as "ready and waiting" not "broken". */}
        <div className="px-5 py-5 grid grid-cols-3 gap-3">
          <HeroStat
            value={stats?.totals.goals ?? 0}
            label={t('stats.goals')}
            dim={!hasAnyGoals}
          />
          <HeroStat
            value={hasAnyGoals ? stats!.totals.per_match.toFixed(1) : '—'}
            label={t('stats.perMatch')}
            dim={!hasAnyGoals}
          />
          {/* Cards block — Phase 2 brings real numbers via match_bookings.
              For now both totals are always 0, so the block dims with the
              rest of the empty state but still occupies the slot to keep
              the layout stable when Phase 2 ships. */}
          <HeroStat
            value={stats?.totals.red_cards ?? 0}
            label={t('stats.redCards')}
            dim={!hasAnyGoals}
            accent="red"
          />
        </div>
      </div>

      {/* Top scorers */}
      <Section title={`⚽ ${t('stats.topScorers')}`}>
        {stats && stats.top_scorers.length > 0 ? (
          <div className="bg-card rounded-2xl shadow-card border border-border/50 divide-y divide-border/40">
            {stats.top_scorers.slice(0, 5).map((scorer, idx) => (
              <div
                key={`${scorer.player_name}-${scorer.team_code}`}
                className="px-4 py-3 flex items-center gap-3"
              >
                <div
                  className={`w-7 h-7 rounded-full font-extrabold text-sm flex items-center justify-center shrink-0 ${
                    RANK_STYLES[idx] ?? 'bg-muted text-muted-foreground'
                  }`}
                >
                  {idx + 1}
                </div>
                <Flag code={scorer.team_code} className="w-5 shrink-0" label={scorer.team_name} />
                <div className="flex-1 min-w-0">
                  <div className="font-semibold truncate text-foreground">
                    {scorer.player_name}
                  </div>
                  <div className="text-xs text-muted-foreground truncate">
                    {scorer.team_name}
                  </div>
                </div>
                <div className="text-xl font-extrabold tabular-nums text-foreground">
                  {scorer.goals}
                </div>
              </div>
            ))}
          </div>
        ) : (
          // Friendly empty-state placeholder. "First goals incoming"
          // copy matches the mockup; tone-matches the rest of the
          // app's empty states (Boost view shows similar copy until
          // picks land).
          <EmptyTile
            emoji="⚽"
            title={t('stats.empty.scorersTitle')}
            subtitle={t('stats.empty.scorersSubtitle')}
          />
        )}
      </Section>

      {/* Team stats grid — four 2×2 tiles. Each tile self-dims when its
          data is missing so the grid never collapses. */}
      <div className="grid grid-cols-2 gap-3">
        <Tile
          label={t('stats.mostGoals')}
          hasData={!!stats && stats.team_goals.length > 0}
        >
          {stats && stats.team_goals[0] && (
            <>
              <div className="flex items-center gap-2">
                <Flag
                  code={stats.team_goals[0].team_code}
                  className="w-5 shrink-0"
                  label={stats.team_goals[0].team_name}
                />
                <span className="font-semibold text-sm text-foreground truncate">
                  {stats.team_goals[0].team_name}
                </span>
              </div>
              <div className="text-xl font-extrabold mt-1 tabular-nums text-foreground">
                {stats.team_goals[0].goals}
              </div>
            </>
          )}
        </Tile>

        <Tile
          label={t('stats.cleanestDefence')}
          hasData={!!stats && stats.clean_sheets.length > 0}
        >
          {stats && stats.clean_sheets[0] && (
            <>
              <div className="flex items-center gap-2">
                <Flag
                  code={stats.clean_sheets[0].team_code}
                  className="w-5 shrink-0"
                  label={stats.clean_sheets[0].team_name}
                />
                <span className="font-semibold text-sm text-foreground truncate">
                  {stats.clean_sheets[0].team_name}
                </span>
              </div>
              <div className="text-xl font-extrabold mt-1 tabular-nums text-foreground">
                {stats.clean_sheets[0].count}{' '}
                <span className="text-xs font-medium text-muted-foreground">
                  {t('stats.cleanSheetsLabel', {
                    count: stats.clean_sheets[0].count,
                  })}
                </span>
              </div>
            </>
          )}
        </Tile>

        <Tile
          label={t('stats.biggestWin')}
          hasData={!!stats?.biggest_win}
        >
          {stats?.biggest_win && (
            <>
              <div className="flex items-center gap-2 text-sm">
                <Flag
                  code={stats.biggest_win.home_team_code}
                  className="w-5 shrink-0"
                  label={stats.biggest_win.home_team_name}
                />
                <span className="font-extrabold tabular-nums text-foreground">
                  {stats.biggest_win.home_score}
                </span>
                <span className="text-muted-foreground">–</span>
                <span className="font-extrabold tabular-nums text-foreground">
                  {stats.biggest_win.away_score}
                </span>
                <Flag
                  code={stats.biggest_win.away_team_code}
                  className="w-5 shrink-0"
                  label={stats.biggest_win.away_team_name}
                />
              </div>
              <div className="text-[11px] text-muted-foreground mt-1">
                {stats.biggest_win.group_name
                  ? `${t('stats.stage.group')} ${stats.biggest_win.group_name}`
                  : t(`stats.stage.${stats.biggest_win.stage}`, {
                      defaultValue: stats.biggest_win.stage,
                    })}
              </div>
            </>
          )}
        </Tile>

        <Tile
          label={t('stats.fastestGoal')}
          hasData={!!stats?.fastest_goal}
        >
          {stats?.fastest_goal && (
            <>
              <div className="text-sm font-semibold text-foreground truncate">
                {stats.fastest_goal.player_name}
              </div>
              <div className="text-[11px] text-muted-foreground mt-0.5 flex items-center gap-1 flex-wrap">
                <Flag
                  code={stats.fastest_goal.team_code}
                  className="w-3.5 shrink-0"
                  label={stats.fastest_goal.team_name}
                />
                <span className="tabular-nums">{stats.fastest_goal.minute}'</span>
                <span>·</span>
                <span className="truncate">
                  {stats.fastest_goal.team_code} – {stats.fastest_goal.opponent_code}
                </span>
              </div>
            </>
          )}
        </Tile>
      </div>

      {/* Discipline panel — Phase 2. Two stat tiles (yellow / red),
          plus a worst-discipline footer that only renders once at
          least one team has a card on the board. Dims when there are
          no bookings yet so the panel still occupies its layout slot. */}
      <Section title={`📒 ${t('stats.discipline')}`}>
        <div className="bg-card rounded-2xl shadow-card border border-border/50 p-4 grid grid-cols-2 gap-4">
          <div className={hasAnyBookings(stats) ? '' : 'opacity-60'}>
            <div className="flex items-center gap-2 mb-1">
              <div className="w-3 h-4 bg-yellow-400 rounded-sm" aria-hidden />
              <span className="text-[10px] uppercase text-muted-foreground tracking-wider">
                {t('stats.yellowCards')}
              </span>
            </div>
            <div className="text-2xl font-extrabold tabular-nums text-foreground">
              {stats?.totals.yellow_cards ?? 0}
            </div>
            {hasAnyBookings(stats) && stats!.totals.cards_per_match != null && (
              <div className="text-[11px] text-muted-foreground mt-1">
                {t('stats.cardsPerMatch', {
                  value: stats!.totals.cards_per_match.toFixed(1),
                })}
              </div>
            )}
          </div>
          <div className={hasAnyBookings(stats) ? '' : 'opacity-60'}>
            <div className="flex items-center gap-2 mb-1">
              <div className="w-3 h-4 bg-destructive rounded-sm" aria-hidden />
              <span className="text-[10px] uppercase text-muted-foreground tracking-wider">
                {t('stats.redCards')}
              </span>
            </div>
            <div className="text-2xl font-extrabold tabular-nums text-foreground">
              {stats?.totals.red_cards ?? 0}
            </div>
            {hasAnyBookings(stats) && matchesPlayed > 0 && stats!.totals.red_cards > 0 && (
              <div className="text-[11px] text-muted-foreground mt-1">
                {t('stats.redCardEvery', {
                  count: Math.max(
                    1,
                    Math.round(matchesPlayed / stats!.totals.red_cards),
                  ),
                })}
              </div>
            )}
          </div>
          {stats?.worst_discipline && (
            <div className="col-span-2 pt-3 border-t border-border/40 flex items-center gap-2 text-xs flex-wrap">
              <span className="text-muted-foreground mr-auto">
                {t('stats.worstDiscipline')}
              </span>
              <Flag
                code={stats.worst_discipline.team_code}
                className="w-4 shrink-0"
                label={stats.worst_discipline.team_name}
              />
              <span className="font-semibold text-foreground truncate">
                {stats.worst_discipline.team_name}
              </span>
              <span className="text-muted-foreground">·</span>
              <span className="tabular-nums text-foreground">
                {t('stats.cardsCount', {
                  count: stats.worst_discipline.total_cards,
                })}
              </span>
            </div>
          )}
        </div>
      </Section>

      {/* Quiet error footer — surfaced only when the fetch actually
          failed, separate from the "no goals yet" empty state. */}
      {error && (
        <p className="text-[11px] text-center text-muted-foreground/70">
          {t('stats.loadError')}
        </p>
      )}
    </motion.div>
  );
};

// Discipline tiles light up the moment any booking exists. We treat
// "any card recorded" as the trigger because that's the data signal —
// not "the tournament has reached the knockout stage" or similar
// time-based heuristic.
const hasAnyBookings = (s: TournamentStats | null): boolean =>
  !!s && (s.totals.yellow_cards + s.totals.red_cards) > 0;

// ─── Tiny presentation components (kept in-file; not reused) ─────────

const HeroStat = ({
  value,
  label,
  dim = false,
  accent,
}: {
  value: number | string;
  label: string;
  dim?: boolean;
  accent?: 'red';
}) => (
  <div
    className={`bg-muted rounded-xl p-4 text-center ${dim ? 'opacity-60' : ''}`}
  >
    <div className="text-2xl font-extrabold tabular-nums text-foreground">
      {value}
    </div>
    <div
      className={`text-[11px] uppercase mt-1 tracking-wider ${
        accent === 'red' ? 'text-destructive' : 'text-muted-foreground'
      }`}
    >
      {label}
    </div>
  </div>
);

const Section = ({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) => (
  <div>
    <h3 className="text-xs uppercase tracking-widest text-muted-foreground font-semibold mb-2 px-1">
      {title}
    </h3>
    {children}
  </div>
);

const EmptyTile = ({
  emoji,
  title,
  subtitle,
}: {
  emoji: string;
  title: string;
  subtitle: string;
}) => (
  <div className="bg-card rounded-2xl shadow-card border border-border/50 p-6 text-center">
    <div className="text-4xl mb-2" aria-hidden>
      {emoji}
    </div>
    <div className="text-sm font-semibold text-foreground">{title}</div>
    <div className="text-xs text-muted-foreground mt-1">{subtitle}</div>
  </div>
);

const Tile = ({
  label,
  hasData,
  children,
}: {
  label: string;
  hasData: boolean;
  children: React.ReactNode;
}) => (
  <div
    className={`bg-card rounded-2xl shadow-card border border-border/50 p-4 ${
      hasData ? '' : 'opacity-60'
    }`}
  >
    <div className="text-[10px] uppercase text-muted-foreground tracking-wider mb-2">
      {label}
    </div>
    {hasData ? children : <div className="text-xl font-extrabold text-muted-foreground/40">—</div>}
  </div>
);
