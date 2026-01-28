import { motion } from 'framer-motion';
import { RefreshCw, Info } from 'lucide-react';
import { useTranslation } from 'react-i18next';

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
  const { t } = useTranslation();

  const getButtonText = () => {
    if (syncing) return t('sync.syncing');
    if (!canSync && cooldownRemaining > 0) return t('sync.wait', { seconds: cooldownRemaining });
    return t('sync.button');
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
          <span>{t('sync.locksInfo')}</span>
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
