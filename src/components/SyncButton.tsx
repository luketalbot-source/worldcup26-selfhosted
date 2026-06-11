import { useEffect, useState } from 'react';
import { RefreshCw, Info } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface SyncButtonProps {
  onSync: () => void;
  syncing: boolean;
  lastSync: Date | null;
  canSync: boolean;
  cooldownRemaining: number;
}

/**
 * Demoted from a card-boxed "Sync Scores" button to a slim caption line.
 * Score freshness is automatic now (session-start sync, 60s auto-sync
 * while matches are live, SSE push), so the old button mostly invited
 * users to mash it against the server cooldown. What survives:
 *   - the predictions-lock notice (left)
 *   - a quiet "updated Xm ago" timestamp (right) that doubles as the
 *     edge-case manual refresh — tap target kept, visual weight gone.
 */
export const SyncButton = ({
  onSync,
  syncing,
  lastSync,
  canSync,
  cooldownRemaining,
}: SyncButtonProps) => {
  const { t } = useTranslation();

  // Re-render every 30s so the relative timestamp doesn't go stale on a
  // screen that's just sitting open.
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  const lastSyncLabel = (() => {
    if (!lastSync) return t('sync.neverSynced');
    const seconds = Math.max(0, Math.floor((Date.now() - lastSync.getTime()) / 1000));
    if (seconds < 60) return t('sync.justNow');
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return t('sync.minutesAgo', { minutes });
    return t('sync.hoursAgo', { hours: Math.floor(minutes / 60) });
  })();

  return (
    <div className="flex items-center justify-between gap-2 px-1 text-[11px] text-muted-foreground/80">
      <span className="flex items-center gap-1 min-w-0">
        <Info className="w-3 h-3 text-amber-500/80 flex-shrink-0" />
        <span className="truncate">{t('sync.locksInfo')}</span>
      </span>

      <button
        type="button"
        onClick={onSync}
        disabled={syncing || !canSync}
        className="flex items-center gap-1 flex-shrink-0 disabled:opacity-60"
        aria-label={t('sync.button')}
      >
        <RefreshCw className={`w-3 h-3 ${syncing ? 'animate-spin' : ''}`} />
        <span>
          {syncing
            ? t('sync.syncing')
            : !canSync && cooldownRemaining > 0
              ? t('sync.wait', { seconds: cooldownRemaining })
              : lastSyncLabel}
        </span>
      </button>
    </div>
  );
};
