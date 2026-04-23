import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { useTheme } from 'next-themes';
import { useTranslation } from 'react-i18next';

interface FlipBridgeState {
  /** True when the app has detected it's running inside the Flip host iframe. */
  isEmbedded: boolean;
  /** True when the Flip bridge has completed its initial theme/lang handshake. */
  bridgeReady: boolean;
}

const Ctx = createContext<FlipBridgeState>({ isEmbedded: false, bridgeReady: false });

/**
 * Top-level provider that wires the Flip host's theme + language into the app.
 *
 * - On mount, detects iframe context via window.parent !== window.
 * - When embedded, lazily imports @getflip/bridge and pulls the parent's
 *   current theme, then subscribes to THEME_CHANGE events to re-apply.
 * - Also reads the parent's initial language once. Doesn't subscribe to
 *   language changes — the in-app language selector stays authoritative so
 *   users can override the host's setting.
 * - Silently no-ops when running standalone (dev mode / admin area).
 */
export const FlipBridgeProvider = ({ children }: { children: ReactNode }) => {
  const { setTheme } = useTheme();
  const { i18n } = useTranslation();

  const [state, setState] = useState<FlipBridgeState>({
    isEmbedded: typeof window !== 'undefined' && window.parent !== window,
    bridgeReady: false,
  });

  useEffect(() => {
    if (!state.isEmbedded) return;

    let unsubscribeTheme: (() => void) | undefined;
    let cancelled = false;

    const wire = async () => {
      try {
        // Dynamic import keeps @getflip/bridge out of the non-embedded bundle
        // (and its pg-style origin checks never run in dev mode).
        const { initFlipBridge, getTheme, getLang, subscribe, BridgeEventType } =
          await import('@getflip/bridge');

        initFlipBridge({
          debug: import.meta.env.DEV,
          // document.referrer is the host origin for a sandboxed iframe; Flip
          // doesn't lock us down to a specific origin but the bridge wants
          // *something* here. Fall back to '*' when referrer is opaque.
          hostAppOrigin: document.referrer || '*',
        });

        // Initial theme handshake.
        const { activeTheme } = await getTheme();
        if (!cancelled && (activeTheme === 'light' || activeTheme === 'dark')) {
          setTheme(activeTheme);
        }

        // Initial language handshake. We don't re-apply on later LANG_CHANGE
        // events — once the user interacts with the in-app selector, that
        // win. Host is just the seed.
        try {
          const lang = await getLang();
          if (!cancelled && typeof lang === 'string' && lang) {
            // Normalise 'en-GB' → 'en' etc. to match i18next's supported list.
            const short = lang.slice(0, 2);
            if (i18n.language !== short) {
              i18n.changeLanguage(short);
            }
          }
        } catch {
          // getLang rejects on older hosts — non-fatal.
        }

        unsubscribeTheme = await subscribe(
          BridgeEventType.THEME_CHANGE,
          (event: { data?: { activeTheme?: 'light' | 'dark' } }) => {
            const next = event.data?.activeTheme;
            if (next === 'light' || next === 'dark') setTheme(next);
          }
        );

        if (!cancelled) setState((s) => ({ ...s, bridgeReady: true }));
      } catch (err) {
        // Not actually in Flip, or bridge refused: leave theme/language as-is.
        console.warn('[flip-bridge] wiring failed, falling back to local:', err);
      }
    };

    void wire();

    return () => {
      cancelled = true;
      if (unsubscribeTheme) unsubscribeTheme();
    };
  }, [state.isEmbedded, setTheme, i18n]);

  return <Ctx.Provider value={state}>{children}</Ctx.Provider>;
};

export const useFlipBridge = () => useContext(Ctx);
