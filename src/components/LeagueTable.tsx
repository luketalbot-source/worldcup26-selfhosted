import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { useMemo } from 'react';
import { useLiveMatches } from '@/hooks/useLiveMatches';
import { useTeams } from '@/hooks/useTeams';
import { useTeamName } from '@/hooks/useTeamName';
import { useCompetitions } from '@/contexts/CompetitionContext';
import { calculateStandings, calculateForm } from '@/lib/standingsCalculator';
import { Flag } from '@/components/Flag';
import { teamVisualProps } from '@/lib/teamVisual';

// Season-long league table (Bundesliga: 18 rows; CL league phase: 36 rows).
// Same visual language as GroupStandings (card + gradient-navy header +
// table markup) but standalone, non-collapsible, crest-aware and with
// qualification-zone tinting from the format profile. Standings are
// computed client-side by the same engine the WC group tables use.
export const LeagueTable = () => {
  const { t } = useTranslation();
  const { getTeamName } = useTeamName();
  const { activeCompetition, profile } = useCompetitions();
  const { liveMatches, getMatchesByMatchday, getMatchdays } = useLiveMatches();
  const { teams } = useTeams();

  // All matches (every matchday) as UI Match objects for the engine.
  const allMatches = useMemo(
    () => getMatchdays().flatMap((day) => getMatchesByMatchday(day)),
    [getMatchdays, getMatchesByMatchday],
  );

  const standings = useMemo(
    () => calculateStandings(allMatches, teams),
    [allMatches, teams],
  );

  const zones = profile.tableZones;
  const zoneClass = (index: number): string => {
    if (!zones) return '';
    if (index < zones.direct) return 'border-l-2 border-l-fifa-green bg-fifa-green/5';
    if (zones.playoff && index < zones.playoff) return 'border-l-2 border-l-primary bg-primary/5';
    return '';
  };

  if (liveMatches.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        {t('standings.noFixtures')}
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-card rounded-2xl shadow-card border border-border/50 overflow-hidden"
    >
      <div className="gradient-navy px-4 py-3">
        <h3 className="text-white font-semibold">
          {activeCompetition?.short_name ?? ''} — {t('standings.tab')}
        </h3>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left py-3 px-3 font-medium text-muted-foreground">#</th>
              <th className="text-left py-3 px-2 font-medium text-muted-foreground">{t('standings.team')}</th>
              <th className="text-center py-3 px-2 font-medium text-muted-foreground">{t('standings.played')}</th>
              <th className="text-center py-3 px-2 font-medium text-muted-foreground hidden sm:table-cell">{t('standings.won')}</th>
              <th className="text-center py-3 px-2 font-medium text-muted-foreground hidden sm:table-cell">{t('standings.drawn')}</th>
              <th className="text-center py-3 px-2 font-medium text-muted-foreground hidden sm:table-cell">{t('standings.lost')}</th>
              <th className="text-center py-3 px-2 font-medium text-muted-foreground">{t('standings.goalDifference')}</th>
              <th className="text-center py-3 px-3 font-medium text-muted-foreground">{t('standings.points')}</th>
              <th className="text-center py-3 px-2 font-medium text-muted-foreground hidden md:table-cell">{t('standings.form')}</th>
            </tr>
          </thead>
          <tbody>
            {standings.map((standing, index) => {
              const form = calculateForm(allMatches, standing.team.id);
              return (
                <motion.tr
                  key={standing.team.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: Math.min(index * 0.02, 0.4) }}
                  className={`border-b border-border/50 last:border-0 ${zoneClass(index)}`}
                >
                  <td className="py-2.5 px-3 text-muted-foreground font-medium">{index + 1}</td>
                  <td className="py-2.5 px-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <Flag {...teamVisualProps(standing.team, profile)} className="w-5 shrink-0" />
                      <span className="font-medium text-foreground truncate">
                        {getTeamName(standing.team.code, standing.team.shortName ?? standing.team.name)}
                      </span>
                    </div>
                  </td>
                  <td className="text-center py-2.5 px-2 text-foreground">{standing.played}</td>
                  <td className="text-center py-2.5 px-2 text-foreground hidden sm:table-cell">{standing.won}</td>
                  <td className="text-center py-2.5 px-2 text-foreground hidden sm:table-cell">{standing.drawn}</td>
                  <td className="text-center py-2.5 px-2 text-foreground hidden sm:table-cell">{standing.lost}</td>
                  <td className="text-center py-2.5 px-2">
                    <span className={standing.goalDifference > 0 ? 'text-fifa-green' : standing.goalDifference < 0 ? 'text-destructive' : ''}>
                      {standing.goalDifference > 0 ? '+' : ''}{standing.goalDifference}
                    </span>
                  </td>
                  <td className="text-center py-2.5 px-3">
                    <span className="font-bold text-foreground">{standing.points}</span>
                  </td>
                  <td className="text-center py-2.5 px-2 hidden md:table-cell">
                    <div className="flex items-center justify-center gap-0.5">
                      {form.map((r, i) => (
                        <span
                          key={i}
                          title={r}
                          className={`w-2 h-2 rounded-full inline-block ${
                            r === 'W' ? 'bg-fifa-green' : r === 'D' ? 'bg-muted-foreground/50' : 'bg-destructive'
                          }`}
                        />
                      ))}
                    </div>
                  </td>
                </motion.tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </motion.div>
  );
};
