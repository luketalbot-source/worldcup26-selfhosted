import { motion } from 'framer-motion';
import { RefreshCw, Info } from 'lucide-react';

interface SyncButtonProps {
  onSync: () => void;
  syncing: boolean;
  lastSync: Date | null;
  canSync: boolean;
  cooldownRemaining: number;
}

export const SyncButton = ({
  onSync,
  syncing,
  lastSync,
  canSync,
  cooldownRemaining,
}: SyncButtonProps) => {
  const formatLastSync = (date: Date | null) => {
    if (!date) return 'Never synced';
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    return date.toLocaleDateString();
  };

  const getButtonText = () => {
    if (syncing) return 'Syncing...';
    if (!canSync && cooldownRemaining > 0) return `Wait ${cooldownRemaining}s`;
    return 'Sync Scores';
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-card rounded-xl p-3 border border-border/50"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground bg-muted/50 rounded-lg px-2 py-1">
          <Info className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />
          <span>Locks 30min before Kickoff</span>
        </div>

        <motion.button
          whileHover={canSync && !syncing ? { scale: 1.05 } : {}}
          whileTap={canSync && !syncing ? { scale: 0.95 } : {}}
          onClick={onSync}
          disabled={syncing || !canSync}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
            canSync && !syncing
              ? 'bg-primary/10 text-primary hover:bg-primary/20'
              : 'bg-muted text-muted-foreground cursor-not-allowed'
          }`}
        >
          <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
          {getButtonText()}
        </motion.button>
      </div>
    </motion.div>
  );
};
