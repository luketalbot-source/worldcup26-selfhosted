// "Who called it" — unfurling list of tenant members whose prediction hit
// the exact final score. Mounted on finished match cards (group +
// knockout). Lazy: nothing is fetched until the user taps the strip, so
// the match list stays free of N extra requests; the backend additionally
// caches per match+tenant for 60s.

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, Target } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { api } from '@/lib/apiClient';
import { useTenant } from '@/contexts/TenantContext';
import { useAuth } from '@/contexts/AuthContext';

interface RevealUser {
  user_id: string;
  display_name: string | null;
  avatar_emoji: string | null;
}

interface RevealResponse {
  revealed: boolean;
  exact_count?: number;
  total_count?: number;
  users?: RevealUser[];
}

export const ExactPredictionsReveal = ({ matchId }: { matchId: string }) => {
  const { t } = useTranslation();
  const { tenantId } = useTenant();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<RevealResponse | null>(null);
  const [loading, setLoading] = useState(false);

  const toggle = async () => {
    const next = !open;
    setOpen(next);
    if (next && !data && !loading && tenantId) {
      setLoading(true);
      try {
        const res = await api.get<RevealResponse>(
          `/matches/${matchId}/exact-predictions`,
          { tenant_id: tenantId },
        );
        setData(res);
      } catch {
        // Quietly collapse back — a transient failure here isn't worth an
        // error banner on a celebratory feature. Next tap retries.
        setData(null);
        setOpen(false);
      } finally {
        setLoading(false);
      }
    }
  };

  if (!tenantId) return null;

  return (
    // bg-card (not bg-white): the first version hardcoded white like the
    // legacy result strips, which made the theme-token text invisible in
    // dark mode (white-on-white). bg-card tracks the active theme so
    // foreground/muted tokens contrast correctly in both. mt-2 separates
    // the strip from the result banner above it.
    <div className="mt-2 rounded-lg overflow-hidden backdrop-blur-sm bg-card/95 border border-border/40">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className="w-full flex items-center justify-center gap-2 py-1.5 px-3 text-xs font-medium text-muted-foreground"
      >
        <Target className="w-3 h-3 text-fifa-gold" />
        <span>{t('reveal.title')}</span>
        <ChevronDown
          className={`w-3 h-3 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <div className="px-3 pb-2 border-t border-border/30">
              {loading && (
                <p className="text-xs text-muted-foreground text-center py-3">…</p>
              )}

              {!loading && data?.revealed && (data.exact_count ?? 0) === 0 && (
                <p className="text-xs text-muted-foreground text-center py-3">
                  {t('reveal.nobody')}
                </p>
              )}

              {!loading && data?.revealed && (data.exact_count ?? 0) > 0 && (
                <>
                  <p className="text-[11px] text-muted-foreground text-center pt-2 pb-1">
                    {t('reveal.calledIt', {
                      exact: data.exact_count,
                      total: data.total_count,
                    })}
                  </p>
                  {/* Native scroll + pan-y: the iOS WebView lesson — no
                      ScrollArea, no nested scroll traps. */}
                  <div
                    className="max-h-48 overflow-y-auto overscroll-contain space-y-0.5"
                    style={{ touchAction: 'pan-y' }}
                  >
                    {(data.users ?? []).map((u) => {
                      const isMe = u.user_id === user?.id;
                      return (
                        <div
                          key={u.user_id}
                          className={`flex items-center gap-2 px-2 py-1 rounded ${
                            isMe ? 'bg-primary/10' : ''
                          }`}
                        >
                          <span className="text-base flex-shrink-0">
                            {u.avatar_emoji || '👤'}
                          </span>
                          <span className="text-xs text-foreground truncate min-w-0">
                            <span translate="no">{u.display_name || '—'}</span>
                            {isMe && (
                              <span className="ml-1 text-primary">
                                {t('leaderboard.you')}
                              </span>
                            )}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                  {(data.exact_count ?? 0) > (data.users?.length ?? 0) && (
                    <p className="text-[10px] text-muted-foreground/70 text-center pt-1">
                      {t('reveal.more', {
                        count: (data.exact_count ?? 0) - (data.users?.length ?? 0),
                      })}
                    </p>
                  )}
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
