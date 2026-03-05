import { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { Trophy, LogIn, Loader2, FlaskConical } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useTenant } from '@/contexts/TenantContext';
import { usePaginatedLeaderboard, LeaderboardEntry } from '@/hooks/usePaginatedLeaderboard';
import { useLoadTestLeaderboard } from '@/hooks/useLoadTestLeaderboard';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ScrollArea } from '@/components/ui/scroll-area';

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

interface LeaderboardRowProps {
  entry: LeaderboardEntry;
  isCurrentUser: boolean;
  index: number;
  skipAnimation?: boolean;
}

const LeaderboardRow = ({ entry, isCurrentUser, index, skipAnimation }: LeaderboardRowProps) => {
  const { t } = useTranslation();
  
  return (
    <motion.div
      initial={skipAnimation ? false : { opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: skipAnimation ? 0 : Math.min(index * 0.02, 0.5) }}
      className={`flex items-center gap-4 p-4 ${isCurrentUser ? 'bg-primary/5' : ''}`}
    >
      <div className="flex-shrink-0 w-8 flex justify-center">
        {getRankDisplay(entry.rank)}
      </div>
      <div className="text-2xl">{entry.avatarEmoji}</div>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-foreground truncate">
          {entry.displayName}
          {isCurrentUser && (
            <span className="ml-2 text-xs text-primary">{t('leaderboard.you')}</span>
          )}
        </p>
        <p className="text-sm text-muted-foreground">
          {entry.totalPredictions} {entry.totalPredictions !== 1 ? t('leaderboard.predictions') : t('leaderboard.prediction')}
        </p>
      </div>
      <div className="text-right">
        <p className="text-lg font-bold text-foreground">{entry.points}</p>
        <p className="text-xs text-muted-foreground">{t('leaderboard.pts')}</p>
      </div>
    </motion.div>
  );
};

export const LeaderboardView = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { tenantId, tenant } = useTenant();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  
  // Check for dev load test mode
  const isLoadTestMode = searchParams.get('devLoadTest') === 'true';
  
  // Use load test hook when in dev mode
  const loadTestData = useLoadTestLeaderboard({ pageSize: 50 });
  
  // Use real data hook for normal mode
  const realData = usePaginatedLeaderboard({
    tenantId,
    pageSize: 50,
    currentUserId: user?.id,
  });
  
  // Select which data source to use
  const { 
    entries, 
    currentUserEntry, 
    loading, 
    loadingMore, 
    hasMore, 
    loadMore 
  } = isLoadTestMode ? loadTestData : realData;

  const scrollRef = useRef<HTMLDivElement>(null);
  const userRowRef = useRef<HTMLDivElement>(null);
  const [showPinnedPosition, setShowPinnedPosition] = useState(false);
  const [userIsVisible, setUserIsVisible] = useState(false);

  // Check if user's actual row is in the displayed entries
  const userInDisplayedEntries = currentUserEntry && entries.some(e => e.userId === currentUserEntry.userId);
  
  // Determine if pinned card should show
  useEffect(() => {
    if (!currentUserEntry) {
      setShowPinnedPosition(false);
      return;
    }
    
    // Show pinned if user exists but isn't visible yet
    if (!userIsVisible && currentUserEntry.rank > 0) {
      setShowPinnedPosition(true);
    } else {
      setShowPinnedPosition(false);
    }
  }, [currentUserEntry, userIsVisible]);

  // Intersection observer to detect when user's row becomes visible
  useEffect(() => {
    if (!userRowRef.current || !userInDisplayedEntries) {
      setUserIsVisible(false);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        setUserIsVisible(entry.isIntersecting);
      },
      { threshold: 0.5 }
    );

    observer.observe(userRowRef.current);
    return () => observer.disconnect();
  }, [userInDisplayedEntries, entries]);

  // Infinite scroll handler
  const handleScroll = useCallback((event: React.UIEvent<HTMLDivElement>) => {
    const target = event.target as HTMLDivElement;
    const { scrollTop, scrollHeight, clientHeight } = target;
    
    // Load more when user is within 200px of bottom
    if (scrollHeight - scrollTop - clientHeight < 200 && hasMore && !loadingMore) {
      loadMore();
    }
  }, [hasMore, loadingMore, loadMore]);

  // In load test mode, skip the login requirement
  if (!user && !isLoadTestMode) {
    return (
      <div className="space-y-4 max-w-[700px] mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-card rounded-2xl shadow-card border border-border/50 overflow-hidden"
        >
          <div className="gradient-hero px-4 py-8 text-center">
            <Trophy className="w-12 h-12 text-white mx-auto mb-3" />
            <h2 className="text-xl font-bold text-white">{t('leaderboard.title')}</h2>
            <p className="text-white/80 text-sm mt-1">{t('leaderboard.compete')}</p>
          </div>
          
          <div className="p-6 text-center">
            <p className="text-muted-foreground mb-4">
              {t('leaderboard.loginPrompt')}
            </p>
            <button
              onClick={() => navigate('/auth')}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-accent text-accent-foreground font-semibold"
            >
              <LogIn className="w-5 h-5" />
              {t('header.login')}
            </button>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="space-y-4 max-w-[700px] mx-auto relative">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-card rounded-2xl shadow-card border border-border/50 overflow-hidden"
      >
        <div className="gradient-hero px-4 py-6 text-center relative">
          {isLoadTestMode && (
            <div className="absolute top-2 right-2 flex items-center gap-1 bg-yellow-500/20 text-yellow-200 text-xs px-2 py-1 rounded-full">
              <FlaskConical className="w-3 h-3" />
              <span>Dev Mode</span>
            </div>
          )}
          <Trophy className="w-12 h-12 text-white mx-auto mb-2" />
          <h2 className="text-xl font-bold text-white">{t('leaderboard.title')}</h2>
          <p className="text-white/80 text-sm mt-1">
            {isLoadTestMode ? `Testing with ${entries.length > 0 ? '1,000' : '0'} synthetic users` : t('leaderboard.subtitle')}
          </p>
        </div>
        
        {loading ? (
          <div className="p-6 text-center text-muted-foreground">{t('leaderboard.loading')}</div>
        ) : entries.length === 0 ? (
          <div className="p-6 text-center">
            <p className="text-muted-foreground">
              {t('leaderboard.noPredictions')}
            </p>
          </div>
        ) : (
          <ScrollArea 
            className="h-[400px] md:h-[500px]" 
            ref={scrollRef}
            onScrollCapture={handleScroll}
          >
            <div className="divide-y divide-border">
              {entries.map((entry, index) => {
                // In load test mode, match by simulated user ID; otherwise match by real user ID
                const isCurrentUser = isLoadTestMode 
                  ? currentUserEntry?.userId === entry.userId
                  : entry.userId === user.id;
                return (
                  <div 
                    key={entry.userId} 
                    ref={isCurrentUser ? userRowRef : undefined}
                  >
                    <LeaderboardRow 
                      entry={entry} 
                      isCurrentUser={isCurrentUser} 
                      index={index}
                      skipAnimation={index >= 50}
                    />
                  </div>
                );
              })}
              
              {/* Loading more indicator */}
              {loadingMore && (
                <div className="p-4 flex justify-center">
                  <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                </div>
              )}
              
              {/* End of list indicator */}
              {!hasMore && entries.length > 50 && (
                <div className="p-4 text-center text-sm text-muted-foreground">
                  {t('leaderboard.endOfList', { count: entries.length })}
                </div>
              )}
            </div>
          </ScrollArea>
        )}
        
        <div className="p-4 bg-muted/30 border-t border-border">
          <div className="grid grid-cols-3 gap-4 text-center text-sm">
            <div>
              <div className="font-bold text-foreground">3</div>
              <div className="text-xs text-muted-foreground">{t('leaderboard.exactScore')}</div>
            </div>
            <div>
              <div className="font-bold text-foreground">1</div>
              <div className="text-xs text-muted-foreground">{t('leaderboard.correctWinner')}</div>
            </div>
            <div>
              <div className="font-bold text-foreground">0</div>
              <div className="text-xs text-muted-foreground">{t('leaderboard.wrong')}</div>
            </div>
          </div>
          <p className="text-xs text-muted-foreground text-center mt-2">
            {t('leaderboard.pointsPerType')}
          </p>
        </div>
      </motion.div>

      {/* Pinned "Your Position" card */}
      {showPinnedPosition && currentUserEntry && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 20 }}
          className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 w-[calc(100%-2rem)] max-w-[668px]"
        >
          <div className="bg-card/95 backdrop-blur-sm rounded-xl shadow-lg border border-primary/20 overflow-hidden">
            <div className="flex items-center gap-4 p-3">
              <div className="flex-shrink-0 w-8 flex justify-center">
                {getRankDisplay(currentUserEntry.rank)}
              </div>
              <div className="text-2xl">{currentUserEntry.avatarEmoji}</div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-foreground truncate">
                  {currentUserEntry.displayName}
                  <span className="ml-2 text-xs text-primary">{t('leaderboard.you')}</span>
                </p>
                <p className="text-sm text-muted-foreground">
                  {currentUserEntry.totalPredictions} {currentUserEntry.totalPredictions !== 1 ? t('leaderboard.predictions') : t('leaderboard.prediction')}
                </p>
              </div>
              <div className="text-right">
                <p className="text-lg font-bold text-foreground">{currentUserEntry.points}</p>
                <p className="text-xs text-muted-foreground">{t('leaderboard.pts')}</p>
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </div>
  );
};
