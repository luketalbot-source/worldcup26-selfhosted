import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { useTheme } from 'next-themes';
import { useTranslation } from 'react-i18next';

interface FlipBridgeState {
  /** True when the app has detected it's running inside the Flip host iframe. */
  isEmbedded: boolean;
  /** True when the Flip bridge has completed its initial theme/lang handshake. */
  bridgeReady: boolean;
  /** Last error the bridge surfaced, if any — handy for debugging in prod. */
  error: string | null;
}

const Ctx = createContext<FlipBridgeState>({ isEmbedded: false, bridgeReady: false, error: null });

// Prefix all bridge-related console output with this tag so Luke can filter
// DevTools easily when debugging. Verbose in all environments — it's a small
// amount of output and critical when the bridge silently fails.
const TAG = '[flip-bridge]';

/**
 * Resolve the most reliable host-origin the browser can tell us about.
 * `window.location.ancestorOrigins` is the Chrome/Safari-supported API that
 * returns the direct parent's origin even for cross-origin iframes. If that's
 * unavailable (Firefox), we fall back to `document.referrer`. '*' is a last
 * resort — some bridge implementations accept it, some don't.
 */
function resolveHostOrigin(): string {
  if (typeof window === 'undefined') return '*';
  const ancestors: DOMStringList | undefined =
    (window.location as unknown as { ancestorOrigins?: DOMStringList }).ancestorOrigins;
  if (ancestors && ancestors.length > 0 && ancestors[0]) return ancestors[0];
  if (document.referrer) {
    try {
      return new URL(document.referrer).origin;
    } catch {
      /* fall through */
    }
  }
  return '*';
}

/**
 * Top-level provider that wires the Flip host's theme + language into the app.
 *
 * - On mount, detects iframe context via window.parent !== window.
 * - When embedded, lazily imports @getflip/bridge and pulls the parent's
 *   current theme, then subscribes to THEME_CHANGE events to re-apply.
 * - Also reads the parent's initial language once. Doesn't subscribe to
 *   language changes — the in-app language selector stays authoritative.
 * - Logs verbosely via `[flip-bridge]` prefix so a silent failure is
 *   visible in DevTools.
 */
export const FlipBridgeProvider = ({ children }: { children: ReactNode }) => {
  const { setTheme } = useTheme();
  const { i18n } = useTranslation();

  const [state, setState] = useState<FlipBridgeState>({
    isEmbedded: typeof window !== 'undefined' && window.parent !== window,
    bridgeReady: false,
    error: null,
  });

  useEffect(() => {
    if (!state.isEmbedded) {
      console.log(`${TAG} not embedded (standalone load); skipping bridge init`);
      return;
    }

    const hostOrigin = resolveHostOrigin();
    console.log(`${TAG} embedded; initialising bridge against host origin: ${hostOrigin}`);

    let unsubscribeTheme: (() => void) | undefined;
    let cancelled = false;

    const wire = async () => {
      try {
        const bridge = await import('@getflip/bridge');
        const { initFlipBridge, getTheme, getLang, subscribe, BridgeEventType } = bridge;

        initFlipBridge({ debug: true, hostAppOrigin: hostOrigin });
        console.log(`${TAG} initFlipBridge called`);

        // Theme handshake. If the host is slow or not bridge-aware, getTheme
        // will reject — we catch and leave the theme at whatever next-themes
        // resolved to on its own.
        try {
          const theme = await getTheme();
          console.log(`${TAG} getTheme →`, theme);
          const active = theme?.activeTheme;
          if (!cancelled && (active === 'light' || active === 'dark')) {
            setTheme(active);
          }
        } catch (err) {
          console.warn(`${TAG} getTheme rejected (host may not expose theme):`, err);
        }

        // Language handshake (initial only; don't subscribe to LANG_CHANGE).
        try {
          const lang = await getLang();
          console.log(`${TAG} getLang →`, lang);
          if (!cancelled && typeof lang === 'string' && lang) {
            const short = lang.slice(0, 2);
            if (i18n.language !== short) i18n.changeLanguage(short);
          }
        } catch (err) {
          console.warn(`${TAG} getLang rejected:`, err);
        }

        // Subscribe to future theme changes.
        try {
          unsubscribeTheme = await subscribe(
            BridgeEventType.THEME_CHANGE,
            (event: { data?: { activeTheme?: 'light' | 'dark' } }) => {
              const next = event.data?.activeTheme;
              console.log(`${TAG} THEME_CHANGE →`, next);
              if (next === 'light' || next === 'dark') setTheme(next);
            }
          );
          console.log(`${TAG} subscribed to THEME_CHANGE`);
        } catch (err) {
          console.warn(`${TAG} subscribe(THEME_CHANGE) rejected:`, err);
        }

        if (!cancelled) setState((s) => ({ ...s, bridgeReady: true, error: null }));
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`${TAG} wiring failed:`, err);
        if (!cancelled) setState((s) => ({ ...s, error: msg }));
      }
    };

    void wire();

    return () => {
      cancelled = true;
      if (unsubscribeTheme) {
        try { unsubscribeTheme(); } catch { /* ignore */ }
      }
    };
  }, [state.isEmbedded, setTheme, i18n]);

  return <Ctx.Provider value={state}>{children}</Ctx.Provider>;
};

export const useFlipBridge = () => useContext(Ctx);
