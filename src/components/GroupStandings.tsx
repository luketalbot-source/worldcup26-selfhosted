import { motion } from 'framer-motion';
import { GroupStanding } from '@/types/match';

interface GroupStandingsProps {
  standings: GroupStanding[];
  group: string;
}

export const GroupStandings = ({ standings, group }: GroupStandingsProps) => {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-card rounded-2xl shadow-card border border-border/50 overflow-hidden"
    >
      <div className="gradient-navy px-4 py-3">
        <h3 className="text-white font-semibold">Group {group} Standings</h3>
      </div>
      
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left py-3 px-4 font-medium text-muted-foreground">#</th>
              <th className="text-left py-3 px-4 font-medium text-muted-foreground">Team</th>
              <th className="text-center py-3 px-2 font-medium text-muted-foreground">P</th>
              <th className="text-center py-3 px-2 font-medium text-muted-foreground">W</th>
              <th className="text-center py-3 px-2 font-medium text-muted-foreground">D</th>
              <th className="text-center py-3 px-2 font-medium text-muted-foreground">L</th>
              <th className="text-center py-3 px-2 font-medium text-muted-foreground">GD</th>
              <th className="text-center py-3 px-4 font-medium text-muted-foreground">Pts</th>
            </tr>
          </thead>
          <tbody>
            {standings.map((standing, index) => (
              <motion.tr
                key={standing.team.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.1 }}
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
                    <span className="font-medium text-foreground">{standing.team.code}</span>
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
  );
};
