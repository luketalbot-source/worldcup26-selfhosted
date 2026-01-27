import { motion } from 'framer-motion';
import { RefreshCw, Clock, Wifi, WifiOff } from 'lucide-react';

interface SyncButtonProps {
  onSync: () => void;
  syncing: boolean;
  lastSync: Date | null;
}

export const SyncButton = ({ onSync, syncing, lastSync }: SyncButtonProps) => {
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

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex items-center justify-between bg-card rounded-xl p-3 border border-border/50"
    >
      <div className="flex items-center gap-2 text-sm">
        {lastSync ? (
          <Wifi className="w-4 h-4 text-fifa-green" />
        ) : (
          <WifiOff className="w-4 h-4 text-muted-foreground" />
        )}
        <span className="text-muted-foreground">
          <Clock className="w-3 h-3 inline mr-1" />
          {formatLastSync(lastSync)}
        </span>
      </div>
      
      <motion.button
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={onSync}
        disabled={syncing}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-primary/10 text-primary text-sm font-medium hover:bg-primary/20 transition-colors disabled:opacity-50"
      >
        <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
        {syncing ? 'Syncing...' : 'Sync Scores'}
      </motion.button>
    </motion.div>
  );
};
