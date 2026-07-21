import { motion } from 'framer-motion';
import { User, Target, CheckCircle, XCircle, TrendingUp, LogIn, Zap, Globe, Moon, Sun, Monitor, Rocket, RefreshCw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useTheme } from 'next-themes';
import { useAuth } from '@/contexts/AuthContext';
import { useTenant } from '@/contexts/TenantContext';
import { useProfile } from '@/hooks/useProfile';
import { useLifetimeStats } from '@/hooks/useLifetimeStats';
import { competitionLabel } from '@/contexts/CompetitionContext';
import { useFlipBridge } from '@/hooks/useFlipBridge';
import { useNavigate, useParams } from 'react-router-dom';
import { EmojiPicker } from '@/components/EmojiPicker';
import { languages } from '@/lib/constants';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export const ProfileView = () => {
  const { t, i18n } = useTranslation();
  const { theme, setTheme } = useTheme();
  const { user } = useAuth();
  const { tenantId } = useTenant();
  const { tenantUid } = useParams();
  const { profile, loading: profileLoading, error: profileError, refetch, updateAvatar } = useProfile(user?.id);
  // Lifetime, across every game the tenant has — accurate regardless of which
  // games have been opened (unlike the per-competition match buckets). Aliased
  // to `stats` so the existing header/stats rendering is unchanged.
  const { lifetime: stats, byCompetition } = useLifetimeStats(user?.id, tenantId);
  const navigate = useNavigate();
  const { isEmbedded, diag, bridgeReady } = useFlipBridge();

  // Display name is read-only — it mirrors the OIDC host identity (see
  // upsertOidcUser on the backend). Only the avatar emoji is editable;
  // picking one fires the PATCH immediately and optimistically updates.
  const handleEmojiChange = (emoji: string) => {
    void updateAvatar(emoji);
  };

  // Where a fresh login should go: tenant SSO when inside a tenant,
  // plain username auth otherwise.
  const reAuth = () => {
    navigate(tenantUid ? `/t/${tenantUid}/auth` : '/auth');
  };

  if (!user) {
    return (
      <div className="space-y-4 max-w-[700px] mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-card rounded-2xl shadow-card border border-border/50 overflow-hidden"
        >
          <div className="gradient-navy px-4 py-8 text-center">
            <div className="w-20 h-20 rounded-full bg-white/10 backdrop-blur flex items-center justify-center mx-auto mb-3">
              <User className="w-10 h-10 text-white" />
            </div>
            <h2 className="text-xl font-bold text-white">{t('profile.guest')}</h2>
            <p className="text-white/70 text-sm mt-1">{t('profile.guestSubtitle')}</p>
          </div>

          <div className="p-6 text-center">
            <p className="text-muted-foreground mb-4">
              {t('profile.guestPrompt')}
            </p>
            <button
              onClick={() => navigate('/auth')}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-accent text-accent-foreground font-semibold"
            >
              <LogIn className="w-5 h-5" />
              {t('profile.enterUsername')}
            </button>
          </div>
        </motion.div>
      </div>
    );
  }

  // Profile fetch still in flight — show a skeleton, NOT the placeholder
  // name. The old code rendered `displayName || t('profile.predictor')`
  // immediately, which (a) flashed a fake-looking name and (b) on a
  // translated page got mangled into an actual-looking name ("Tipper" →
  // "Kipper" via Chrome auto-translate, reported by SCHÄFER Werke).
  if (profileLoading && !profile) {
    return (
      <div className="space-y-4 max-w-[700px] mx-auto">
        <div className="bg-card rounded-2xl shadow-card border border-border/50 overflow-hidden">
          <div className="gradient-navy px-4 py-8 flex flex-col items-center gap-3">
            <div className="w-20 h-20 rounded-full bg-white/10 animate-pulse" />
            <div className="h-5 w-40 rounded bg-white/10 animate-pulse" />
          </div>
          <div className="p-4 grid grid-cols-2 gap-4">
            <div className="bg-muted rounded-xl h-24 animate-pulse" />
            <div className="bg-muted rounded-xl h-24 animate-pulse" />
          </div>
        </div>
      </div>
    );
  }

  // Profile failed to load — the session is stale or the API hiccuped.
  // Render an explicit recovery card instead of a hollow logged-in shell
  // with placeholder name + zeroed stats (users read that as "the app
  // lost my data / shows the wrong person").
  if (profileError && !profile) {
    return (
      <div className="space-y-4 max-w-[700px] mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-card rounded-2xl shadow-card border border-border/50 overflow-hidden"
        >
          <div className="gradient-navy px-4 py-8 text-center">
            <div className="w-20 h-20 rounded-full bg-white/10 backdrop-blur flex items-center justify-center mx-auto mb-3">
              <User className="w-10 h-10 text-white" />
            </div>
            <h2 className="text-xl font-bold text-white">{t('profile.loadErrorTitle')}</h2>
            <p className="text-white/70 text-sm mt-1">{t('profile.loadErrorSubtitle')}</p>
          </div>
          <div className="p-6 text-center space-y-3">
            {profileError === 'failed' && (
              <button
                onClick={() => void refetch()}
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-muted text-foreground font-semibold"
              >
                <RefreshCw className="w-5 h-5" />
                {t('profile.retry')}
              </button>
            )}
            <div>
              <button
                onClick={reAuth}
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-accent text-accent-foreground font-semibold"
              >
                <LogIn className="w-5 h-5" />
                {t('profile.reLogin')}
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="space-y-4 max-w-[700px] mx-auto">
      {/* Profile Header */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-card rounded-2xl shadow-card border border-border/50 overflow-hidden"
      >
        <div className="gradient-navy px-4 py-8 text-center">
          <div className="flex flex-col items-center gap-3">
            {/* Avatar is the emoji picker trigger — tap to change. */}
            <div className="w-20 h-20 rounded-full bg-white/10 backdrop-blur flex items-center justify-center text-4xl">
              <EmojiPicker
                value={profile?.avatarEmoji || '👤'}
                onChange={handleEmojiChange}
              />
            </div>
            {/* translate="no": user names must never be machine-translated.
                Chrome auto-translate once turned the German placeholder
                "Tipper" into "Kipper" and a customer reported it as a
                wrong-name bug. Real names are equally at risk. */}
            <h2 className="text-xl font-bold text-white" translate="no">
              {profile?.displayName || t('profile.predictor')}
            </h2>
          </div>
        </div>

        <div className="p-4">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground text-center mb-3">
            {t('profile.allGames', 'Across all games')}
          </p>
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-muted rounded-xl p-4 text-center">
              <Target className="w-6 h-6 text-primary mx-auto mb-2" />
              <div className="text-2xl font-bold text-foreground">{stats.totalPredictions}</div>
              <div className="text-xs text-muted-foreground">{t('profile.predictions')}</div>
            </div>
            <div className="bg-muted rounded-xl p-4 text-center">
              <TrendingUp className="w-6 h-6 text-fifa-green mx-auto mb-2" />
              <div className="text-2xl font-bold text-foreground">{stats.totalPoints}</div>
              <div className="text-xs text-muted-foreground">{t('profile.points')}</div>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Stats Card */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="bg-card rounded-2xl shadow-card border border-border/50 p-4"
      >
        <h3 className="font-semibold text-foreground mb-4">{t('profile.yourStats')}</h3>

        <div className="space-y-3">
          <div className="flex items-center justify-between py-2 border-b border-border/50">
            <div className="flex items-center gap-3">
              <Zap className="w-5 h-5 text-fifa-gold" />
              <span className="text-sm text-foreground">{t('profile.exactScores')}</span>
            </div>
            <span className="font-semibold text-foreground">{stats.exactScores}</span>
          </div>

          <div className="flex items-center justify-between py-2 border-b border-border/50">
            <div className="flex items-center gap-3">
              <CheckCircle className="w-5 h-5 text-fifa-green" />
              <span className="text-sm text-foreground">{t('profile.correctResults')}</span>
            </div>
            <span className="font-semibold text-foreground">{stats.correctResults}</span>
          </div>

          <div className="flex items-center justify-between py-2 border-b border-border/50">
            <div className="flex items-center gap-3">
              <XCircle className="w-5 h-5 text-destructive" />
              <span className="text-sm text-foreground">{t('profile.wrongResults')}</span>
            </div>
            <span className="font-semibold text-foreground">{stats.wrongResults}</span>
          </div>

          <div className="flex items-center justify-between py-2 border-b border-border/50">
            <div className="flex items-center gap-3">
              <Rocket className="w-5 h-5 text-primary" />
              <span className="text-sm text-foreground">{t('profile.boostPoints', 'Boost Points')}</span>
            </div>
            <span className="font-semibold text-foreground">{stats.boostPoints}</span>
          </div>

          <div className="flex items-center justify-between py-2">
            <div className="flex items-center gap-3">
              <Target className="w-5 h-5 text-primary" />
              <span className="text-sm text-foreground">{t('profile.accuracy')}</span>
            </div>
            <span className="font-semibold text-foreground">
              {stats.exactScores + stats.correctResults + stats.wrongResults > 0
                ? `${stats.accuracy}%`
                : '--'}
            </span>
          </div>
        </div>
      </motion.div>

      {/* Per-game breakdown — only when there's more than one game to break
          down (for a single-game tenant it just repeats the lifetime totals). */}
      {byCompetition.length > 1 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="bg-card rounded-2xl shadow-card border border-border/50 p-4"
        >
          <h3 className="font-semibold text-foreground mb-4">{t('profile.byGame', 'By game')}</h3>
          <div className="space-y-1">
            {byCompetition.map(({ competition, stats: cs }) => (
              <div
                key={competition.id}
                className="flex items-center justify-between py-2 border-b border-border/50 last:border-0"
              >
                <span className="text-sm text-foreground truncate pr-3">{competitionLabel(competition)}</span>
                <span className="text-xs text-muted-foreground shrink-0 whitespace-nowrap">
                  {cs.totalPredictions} {t('profile.predictionsShort', 'preds')} ·{' '}
                  <span className="font-semibold text-foreground">
                    {cs.totalPoints} {t('profile.pointsShort', 'pts')}
                  </span>
                </span>
              </div>
            ))}
          </div>
        </motion.div>
      )}

      {/* Settings Card */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="bg-card rounded-2xl shadow-card border border-border/50 p-4"
      >
        <h3 className="font-semibold text-foreground mb-4">{t('profile.settings')}</h3>

        <div className="space-y-4">
          {/* Language Setting. Was a horizontal row of flag buttons —
              fine at 6 languages, but expanding to 14 (CEE rollout)
              overflowed on every reasonable phone width. Now a
              Select-style trigger that shows the active flag + name
              and opens a scrollable list on tap. Same flipLangOverride
              flag semantics as before — manual pick wins over what
              the Flip host announces on subsequent mounts. */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Globe className="w-5 h-5 text-muted-foreground" />
              <span className="text-sm text-foreground">{t('profile.language')}</span>
            </div>
            <Select
              value={i18n.language}
              onValueChange={(code) => {
                // The Flip Bridge calls i18n.changeLanguage on every
                // mount (from getLang) and on every host LANG_CHANGE
                // event — which would silently overwrite a manual
                // pick. Setting this flag tells the bridge to keep
                // its hands off; see FlipBridgeProvider for the
                // matching guard.
                try {
                  localStorage.setItem('flipLangOverride', '1');
                } catch { /* private-mode storage; safe to ignore */ }
                void i18n.changeLanguage(code);
              }}
            >
              <SelectTrigger className="w-auto min-w-[120px] h-9 gap-2">
                <SelectValue placeholder={t('profile.language')} />
              </SelectTrigger>
              <SelectContent className="max-h-[60vh]">
                {languages.map((lang) => (
                  <SelectItem key={lang.code} value={lang.code}>
                    <span className="inline-flex items-center gap-2">
                      <span className="text-base">{lang.flag}</span>
                      <span>{lang.name}</span>
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Theme Setting — hidden when embedded in Flip (host controls it).
              `isEmbedded` is tri-state: null while detection is still in
              flight, true when host confirmed, false when standalone is
              confirmed. We only show the picker after standalone is
              confirmed — that way mobile users never see a brief flash
              of the picker before the bridge handshake finishes. */}
          {isEmbedded === false && (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {theme === 'dark' ? (
                  <Moon className="w-5 h-5 text-muted-foreground" />
                ) : theme === 'light' ? (
                  <Sun className="w-5 h-5 text-muted-foreground" />
                ) : (
                  <Monitor className="w-5 h-5 text-muted-foreground" />
                )}
                <span className="text-sm text-foreground">{t('profile.theme')}</span>
              </div>
              <div className="flex gap-1">
                <button
                  onClick={() => setTheme('light')}
                  className={`p-2 rounded-lg transition-colors ${
                    theme === 'light' ? 'bg-primary/20 ring-1 ring-primary' : 'hover:bg-muted'
                  }`}
                  title={t('theme.light')}
                >
                  <Sun className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setTheme('dark')}
                  className={`p-2 rounded-lg transition-colors ${
                    theme === 'dark' ? 'bg-primary/20 ring-1 ring-primary' : 'hover:bg-muted'
                  }`}
                  title={t('theme.dark')}
                >
                  <Moon className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setTheme('system')}
                  className={`p-2 rounded-lg transition-colors ${
                    theme === 'system' ? 'bg-primary/20 ring-1 ring-primary' : 'hover:bg-muted'
                  }`}
                  title={t('theme.system')}
                >
                  <Monitor className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* Temporary Flip Bridge diagnostics. Render a screenshot-able
              readout of every detection signal we tried, so we can debug
              mobile transport issues without remote DevTools. Remove once
              the mobile bridge is reliable. */}
          <details className="text-[10px] text-muted-foreground/70 border-t border-border/40 pt-3 mt-2">
            <summary className="cursor-pointer select-none">Bridge diagnostics</summary>
            <pre className="mt-2 whitespace-pre-wrap break-all bg-muted/30 rounded p-2 leading-tight">
{`build        = ${__BUILD_ID__}
isEmbedded   = ${String(isEmbedded)}
bridgeReady  = ${String(bridgeReady)}
inIframe     = ${diag.inIframe}
FlipFlutter  = ${diag.flipFlutter}
webkit.MH    = ${diag.webkitMessageHandlers}
Android      = ${diag.androidInterface}
resolvedAt   = ${diag.resolvedAtMs === null ? '(pending)' : diag.resolvedAtMs + 'ms'}
UA           = ${diag.userAgent}`}
            </pre>
          </details>
        </div>
      </motion.div>
    </div>
  );
};
