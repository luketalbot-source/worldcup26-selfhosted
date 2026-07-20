import { motion } from 'framer-motion';
import { Archive, ChevronRight, Swords, Table2, Trophy } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useCompetitions, type Competition } from '@/contexts/CompetitionContext';
import { competitionBanners } from '@/assets/competitions';

// The game hub: entry page for tenants with several competitions enabled.
// One card per ACTIVE game, with completed (archived) games in their own
// muted section below. Tapping a card enters that game; the switch chip in
// the main UI (CompetitionSwitchChip) brings the user back here.
//
// Single-competition tenants never see this — CompetitionContext skips the
// hub and auto-selects the only game.

const FORMAT_META: Record<Competition['format'], { icon: typeof Trophy; subtitleKey: string }> = {
  tournament: { icon: Trophy, subtitleKey: 'competitions.formatTournament' },
  league: { icon: Table2, subtitleKey: 'competitions.formatLeague' },
  hybrid: { icon: Swords, subtitleKey: 'competitions.formatHybrid' },
};

const GameCard = ({
  comp,
  archived,
  onEnter,
  index,
}: {
  comp: Competition;
  archived: boolean;
  onEnter: () => void;
  index: number;
}) => {
  const { t } = useTranslation();
  const Icon = archived ? Archive : FORMAT_META[comp.format].icon;
  const banner = competitionBanners[comp.fd_code];

  if (banner) {
    // Banner card: illustrated art with a left-to-right dark scrim so the
    // white text stays readable over any artwork. Archived games render
    // desaturated with the archive badge.
    return (
      <motion.button
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: index * 0.06 }}
        whileTap={{ scale: 0.98 }}
        onClick={onEnter}
        className="relative w-full text-left rounded-2xl border border-border/50 shadow-card overflow-hidden transition-all hover:shadow-lg h-28"
      >
        <img
          src={banner}
          alt=""
          aria-hidden
          loading="lazy"
          decoding="async"
          className={`absolute inset-0 w-full h-full object-cover ${archived ? 'grayscale-[0.7] opacity-70' : ''}`}
        />
        <div className="absolute inset-0 bg-gradient-to-r from-black/75 via-black/40 to-black/10" />
        <div className="relative h-full flex items-center gap-4 p-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="font-bold text-white truncate drop-shadow">{comp.name}</h3>
              <span className="text-xs text-white/70 shrink-0">{comp.season}</span>
              {archived && (
                <span className="flex items-center gap-1 bg-white/15 backdrop-blur-sm text-white/90 text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded shrink-0">
                  <Archive className="w-3 h-3" />
                  {t('competitions.completedBadge')}
                </span>
              )}
            </div>
            <p className="text-sm text-white/80 truncate drop-shadow">
              {archived ? t('competitions.seasonEnded') : t(FORMAT_META[comp.format].subtitleKey)}
            </p>
          </div>
          <ChevronRight className="w-5 h-5 text-white/80 shrink-0" />
        </div>
      </motion.button>
    );
  }

  return (
    <motion.button
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.06 }}
      whileTap={{ scale: 0.98 }}
      onClick={onEnter}
      className={`w-full text-left rounded-2xl border shadow-card overflow-hidden transition-all hover:shadow-lg ${
        archived ? 'bg-muted/40 border-border/40' : 'bg-card border-border/50'
      }`}
    >
      <div className="flex items-center gap-4 p-4">
        <div
          className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${
            archived ? 'bg-muted text-muted-foreground' : 'gradient-navy text-white'
          }`}
        >
          <Icon className="w-6 h-6" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className={`font-bold truncate ${archived ? 'text-muted-foreground' : 'text-foreground'}`}>
              {comp.name}
            </h3>
            <span className="text-xs text-muted-foreground shrink-0">{comp.season}</span>
          </div>
          <p className="text-sm text-muted-foreground truncate">
            {archived ? t('competitions.seasonEnded') : t(FORMAT_META[comp.format].subtitleKey)}
          </p>
        </div>
        <ChevronRight className="w-5 h-5 text-muted-foreground shrink-0" />
      </div>
    </motion.button>
  );
};

export const CompetitionHub = () => {
  const { t } = useTranslation();
  const { competitions, setActiveCompetition } = useCompetitions();

  const active = competitions.filter((c) => c.is_active);
  const completed = competitions.filter((c) => !c.is_active);

  return (
    <div className="max-w-[700px] mx-auto space-y-6">
      {/* Hero header, same visual language as the Boost/Stats headers */}
      <div className="bg-card rounded-2xl shadow-card border border-border/50 overflow-hidden">
        <div className="gradient-navy px-5 pt-6 pb-5">
          <h2 className="text-2xl font-extrabold text-white">{t('competitions.hubTitle')}</h2>
          <p className="text-sm text-white/70 mt-1">{t('competitions.hubSubtitle')}</p>
        </div>
      </div>

      {active.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide px-1">
            {t('competitions.availableGames')}
          </h3>
          {active.map((comp, i) => (
            <GameCard
              key={comp.id}
              comp={comp}
              archived={false}
              index={i}
              onEnter={() => setActiveCompetition(comp.id)}
            />
          ))}
        </div>
      )}

      {completed.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide px-1">
            {t('competitions.completedGames')}
          </h3>
          {completed.map((comp, i) => (
            <GameCard
              key={comp.id}
              comp={comp}
              archived
              index={active.length + i}
              onEnter={() => setActiveCompetition(comp.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
};
