import { motion } from 'framer-motion';
import { Trophy, Medal, Award } from 'lucide-react';

interface LeaderboardEntry {
  rank: number;
  name: string;
  avatar: string;
  points: number;
  correctPredictions: number;
}

// Mock leaderboard data
const mockLeaderboard: LeaderboardEntry[] = [
  { rank: 1, name: 'You', avatar: '👤', points: 0, correctPredictions: 0 },
];

const getRankIcon = (rank: number) => {
  switch (rank) {
    case 1:
      return <Trophy className="w-5 h-5 text-fifa-gold" />;
    case 2:
      return <Medal className="w-5 h-5 text-gray-400" />;
    case 3:
      return <Award className="w-5 h-5 text-amber-700" />;
    default:
      return <span className="w-5 h-5 flex items-center justify-center text-sm font-bold text-muted-foreground">{rank}</span>;
  }
};

export const LeaderboardView = () => {
  return (
    <div className="space-y-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-card rounded-2xl shadow-card border border-border/50 overflow-hidden"
      >
        <div className="gradient-hero px-4 py-6 text-center">
          <Trophy className="w-12 h-12 text-white mx-auto mb-2" />
          <h2 className="text-xl font-bold text-white">Leaderboard</h2>
          <p className="text-white/80 text-sm mt-1">Coming soon!</p>
        </div>
        
        <div className="p-6 text-center">
          <p className="text-muted-foreground">
            Start making predictions to climb the leaderboard. Once matches are played, 
            your correct predictions will earn you points!
          </p>
          
          <div className="mt-6 grid grid-cols-3 gap-4">
            <div className="bg-muted rounded-xl p-4">
              <div className="text-2xl font-bold text-foreground">3</div>
              <div className="text-xs text-muted-foreground mt-1">Exact Score</div>
            </div>
            <div className="bg-muted rounded-xl p-4">
              <div className="text-2xl font-bold text-foreground">1</div>
              <div className="text-xs text-muted-foreground mt-1">Correct Winner</div>
            </div>
            <div className="bg-muted rounded-xl p-4">
              <div className="text-2xl font-bold text-foreground">0</div>
              <div className="text-xs text-muted-foreground mt-1">Wrong</div>
            </div>
          </div>
          
          <p className="text-xs text-muted-foreground mt-4">
            Points per prediction type
          </p>
        </div>
      </motion.div>
    </div>
  );
};
