import { motion } from 'framer-motion';
import { Trophy, LogIn } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useLeaderboard } from '@/hooks/useLeaderboard';
import { useNavigate } from 'react-router-dom';

const getRankDisplay = (rank: number) => {
  switch (rank) {
    case 1:
      return <span className="text-xl">🥇</span>;
    case 2:
      return <span className="text-xl">🥈</span>;
    case 3:
      return <span className="text-xl">🥉</span>;
    default:
      return <span className="w-6 h-6 flex items-center justify-center text-sm font-bold text-muted-foreground bg-muted rounded-full">{rank}</span>;
  }
};

export const LeaderboardView = () => {
  const { user } = useAuth();
  const { leaderboard, loading } = useLeaderboard();
  const navigate = useNavigate();

  if (!user) {
    return (
      <div className="space-y-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-card rounded-2xl shadow-card border border-border/50 overflow-hidden"
        >
          <div className="gradient-hero px-4 py-8 text-center">
            <Trophy className="w-12 h-12 text-white mx-auto mb-3" />
            <h2 className="text-xl font-bold text-white">Leaderboard</h2>
            <p className="text-white/80 text-sm mt-1">Compete with other predictors!</p>
          </div>
          
          <div className="p-6 text-center">
            <p className="text-muted-foreground mb-4">
              Log in to see the leaderboard and compete with friends!
            </p>
            <button
              onClick={() => navigate('/auth')}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-accent text-accent-foreground font-semibold"
            >
              <LogIn className="w-5 h-5" />
              Log In
            </button>
          </div>
        </motion.div>
      </div>
    );
  }

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
          <p className="text-white/80 text-sm mt-1">Top predictors</p>
        </div>
        
        {loading ? (
          <div className="p-6 text-center text-muted-foreground">Loading...</div>
        ) : leaderboard.length === 0 ? (
          <div className="p-6 text-center">
            <p className="text-muted-foreground">
              No predictions yet! Be the first to make predictions and top the leaderboard.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {leaderboard.map((entry, index) => (
              <motion.div
                key={entry.userId}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.05 }}
                className={`flex items-center gap-4 p-4 ${
                  entry.userId === user.id ? 'bg-primary/5' : ''
                }`}
              >
                <div className="flex-shrink-0 w-8 flex justify-center">
                  {getRankDisplay(entry.rank)}
                </div>
                <div className="text-2xl">{entry.avatarEmoji}</div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-foreground truncate">
                    {entry.displayName}
                    {entry.userId === user.id && (
                      <span className="ml-2 text-xs text-primary">(You)</span>
                    )}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {entry.totalPredictions} prediction{entry.totalPredictions !== 1 ? 's' : ''}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-lg font-bold text-foreground">{entry.points}</p>
                  <p className="text-xs text-muted-foreground">pts</p>
                </div>
              </motion.div>
            ))}
          </div>
        )}
        
        <div className="p-4 bg-muted/30 border-t border-border">
          <div className="grid grid-cols-3 gap-4 text-center text-sm">
            <div>
              <div className="font-bold text-foreground">3</div>
              <div className="text-xs text-muted-foreground">Exact Score</div>
            </div>
            <div>
              <div className="font-bold text-foreground">1</div>
              <div className="text-xs text-muted-foreground">Correct Winner</div>
            </div>
            <div>
              <div className="font-bold text-foreground">0</div>
              <div className="text-xs text-muted-foreground">Wrong</div>
            </div>
          </div>
          <p className="text-xs text-muted-foreground text-center mt-2">
            Points per prediction type
          </p>
        </div>
      </motion.div>
    </div>
  );
};
