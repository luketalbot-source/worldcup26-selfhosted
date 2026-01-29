import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { ChevronDown } from 'lucide-react';
import { GroupStanding } from '@/types/match';
import { useTeamName } from '@/hooks/useTeamName';

interface GroupStandingsProps {
  standings: GroupStanding[];
  group: string;
}

export const GroupStandings = ({ standings, group }: GroupStandingsProps) => {
  const { t } = useTranslation();
  const { getTeamName } = useTeamName();
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-card rounded-2xl shadow-card border border-border/50 overflow-hidden"
    >
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full gradient-navy px-4 py-3 flex items-center justify-between cursor-pointer hover:opacity-90 transition-opacity"
      >
        <h3 className="text-white font-semibold">{t('standings.title', { letter: group })}</h3>
        <motion.div
          animate={{ rotate: isExpanded ? 180 : 0 }}
          transition={{ duration: 0.3, ease: "easeInOut" }}
        >
          <ChevronDown className="w-5 h-5 text-white" />
        </motion.div>
      </button>
      
      <AnimatePresence initial={false}>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: "easeInOut" }}
            className="overflow-hidden"
          >
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground">{t('standings.rank')}</th>
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground">{t('standings.team')}</th>
                    <th className="text-center py-3 px-2 font-medium text-muted-foreground">{t('standings.played')}</th>
                    <th className="text-center py-3 px-2 font-medium text-muted-foreground">{t('standings.won')}</th>
                    <th className="text-center py-3 px-2 font-medium text-muted-foreground">{t('standings.drawn')}</th>
                    <th className="text-center py-3 px-2 font-medium text-muted-foreground">{t('standings.lost')}</th>
                    <th className="text-center py-3 px-2 font-medium text-muted-foreground">{t('standings.goalDifference')}</th>
                    <th className="text-center py-3 px-4 font-medium text-muted-foreground">{t('standings.points')}</th>
                  </tr>
                </thead>
                <tbody>
                  {standings.map((standing, index) => (
                    <motion.tr
                      key={standing.team.id}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: index * 0.05 }}
                      className={`border-b border-border/50 last:border-0 ${
                        index < 2 ? 'bg-primary/5' : ''
                      }`}
                    >
                      <td className="py-3 px-4">
                        <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                          index < 2 ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
                        }`}>
                          {index + 1}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2">
                          <span className="text-xl">{standing.team.flag}</span>
                          <span className="font-medium text-foreground">{getTeamName(standing.team.code, standing.team.name)}</span>
                        </div>
                      </td>
                      <td className="text-center py-3 px-2 text-foreground">{standing.played}</td>
                      <td className="text-center py-3 px-2 text-foreground">{standing.won}</td>
                      <td className="text-center py-3 px-2 text-foreground">{standing.drawn}</td>
                      <td className="text-center py-3 px-2 text-foreground">{standing.lost}</td>
                      <td className="text-center py-3 px-2 text-foreground">
                        <span className={standing.goalDifference > 0 ? 'text-fifa-green' : standing.goalDifference < 0 ? 'text-destructive' : ''}>
                          {standing.goalDifference > 0 ? '+' : ''}{standing.goalDifference}
                        </span>
                      </td>
                      <td className="text-center py-3 px-4">
                        <span className="font-bold text-foreground">{standing.points}</span>
                      </td>
                    </motion.tr>
                  ))}
                </tbody>
              </table>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};