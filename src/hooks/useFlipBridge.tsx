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
 *
 * On Flutter mobile the page loads in a top-level WebView (no iframe, no
 * referrer), so neither lookup yields anything. That's fine because the
 * bridge's `isAllowedOrigin` short-circuits to `true` when FlipFlutter is
 * injected — the value we pass to `initFlipBridge` is unused on mobile.
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
 * "Embedded" means we should run the bridge handshake. Two cases:
 *
 * 1. **Iframe embed (web)** — `window.parent !== window`. Flip host loads
 *    us inside an iframe; the bridge talks to the parent via postMessage.
 *
 * 2. **Flutter WebView (mobile)** — `'FlipFlutter' in window`. The Flip
 *    mobile app injects a `FlipFlutter` JS object into the WebView and
 *    loads us as the *top-level* document, so `window.parent === window`
 *    and the iframe check fails. Without this branch the entire bridge
 *    wiring was being skipped on mobile (language never followed the host,
 *    theme reverted to next-themes defaults, etc.) — silently, because
 *    "not embedded; skipping bridge init" looked benign in the logs.
 */
function detectEmbedded(): boolean {
  if (typeof window === 'undefined') return false;
  const inIframe = window.parent !== window;
  const inFlutter = 'FlipFlutter' in window;
  return inIframe || inFlutter;
}

/**
 * Top-level provider that wires the Flip host's theme + language into the app.
 *
 * - On mount, detects iframe context via window.parent !== window.
 * - When embedded, lazily imports @getflip/bridge and pulls the parent's
 *   current theme, then subscribes to THEME_CHANGE events to re-apply.
 * - Also reads the parent's initial language AND subscribes to LANG_CHANGE
 *   so the in-app strings follow the host whenever the user changes
 *   language in Flip — same pattern as theme. The in-app language selector
 *   still works (it calls i18n.changeLanguage locally) but any subsequent
 *   host event will override it.
 * - Logs verbosely via `[flip-bridge]` prefix so a silent failure is
 *   visible in DevTools.
 */
// Bridge's getLang/getTheme resolve with EITHER the value OR a
// `{ code: BridgeErrorCode }` shape — they don't throw on platform-level
// rejections like FORBIDDEN_ORIGIN. The narrow check below splits the
// two cases so we don't silently treat an error response as "no value".
function isBridgeError(v: unknown): v is { code: string } {
  return typeof v === 'object' && v !== null && typeof (v as { code?: unknown }).code === 'string';
}

// Normalise whatever locale the host hands us (e.g. "de-DE", "pt_BR")
// to our supported 2-letter set. Unsupported codes return null so we
// don't call i18n.changeLanguage with garbage that'd just fall back to
// `en` and lose information.
const SUPPORTED = new Set(['en', 'es', 'de', 'fr', 'pt', 'it']);
function normaliseLang(raw: unknown): string | null {
  if (typeof raw !== 'string' || raw.length < 2) return null;
  const short = raw.slice(0, 2).toLowerCase();
  return SUPPORTED.has(short) ? short : null;
}
export const FlipBridgeProvider = ({ children }: { children: ReactNode }) => {
  const { setTheme } = useTheme();
  const { i18n } = useTranslation();

  const [state, setState] = useState<FlipBridgeState>({
    isEmbedded: detectEmbedded(),
    bridgeReady: false,
    error: null,
  });

  useEffect(() => {
    if (!state.isEmbedded) {
      console.log(`${TAG} not embedded (standalone load); skipping bridge init`);
      return;
    }

    const hostOrigin = resolveHostOrigin();
    const transport = 'FlipFlutter' in window ? 'flutter-webview' : 'iframe';
    console.log(`${TAG} embedded (${transport}); initialising bridge against host origin: ${hostOrigin}`);

    let unsubscribeTheme: (() => void) | undefined;
    let unsubscribeLang: (() => void) | undefined;
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
          if (isBridgeError(theme)) {
            console.warn(`${TAG} getTheme returned BridgeError:`, theme);
          } else {
            const active = theme?.activeTheme;
            if (!cancelled && (active === 'light' || active === 'dark')) {
              setTheme(active);
            }
          }
        } catch (err) {
          console.warn(`${TAG} getTheme rejected (host may not expose theme):`, err);
        }

        // Initial language handshake. getLang resolves with either a string
        // or `{ code: BridgeErrorCode }` — branch on both.
        try {
          const lang = await getLang();
          console.log(`${TAG} getLang →`, lang);
          if (isBridgeError(lang)) {
            console.warn(`${TAG} getLang returned BridgeError:`, lang);
          } else {
            const normalised = normaliseLang(lang);
            if (!cancelled && normalised && i18n.language !== normalised) {
              console.log(`${TAG} applying host language: ${normalised} (was ${i18n.language})`);
              i18n.changeLanguage(normalised);
            } else if (!cancelled && !normalised) {
              console.warn(`${TAG} host language "${lang}" not in supported set — leaving as ${i18n.language}`);
            }
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

        // Subscribe to language changes. When the user changes language in
        // Flip after the iframe has loaded, we re-apply it here. Event
        // payload shape: { data: <langCode> } based on the bridge SDK's
        // existing patterns — we defensively support both bare-string and
        // wrapped-object payloads.
        try {
          unsubscribeLang = await subscribe(
            BridgeEventType.LANG_CHANGE,
            (event: { data?: unknown }) => {
              // Some bridge implementations deliver the new lang as the
              // bare event.data; others wrap it. Try both.
              const raw = typeof event.data === 'string'
                ? event.data
                : (event.data as { lang?: string; activeLang?: string } | undefined)?.lang
                    ?? (event.data as { activeLang?: string } | undefined)?.activeLang;
              const next = normaliseLang(raw);
              console.log(`${TAG} LANG_CHANGE →`, event.data, '→ normalised:', next);
              if (next && i18n.language !== next) i18n.changeLanguage(next);
            }
          );
          console.log(`${TAG} subscribed to LANG_CHANGE`);
        } catch (err) {
          console.warn(`${TAG} subscribe(LANG_CHANGE) rejected:`, err);
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
      if (unsubscribeLang) {
        try { unsubscribeLang(); } catch { /* ignore */ }
      }
    };
  }, [state.isEmbedded, setTheme, i18n]);

  return <Ctx.Provider value={state}>{children}</Ctx.Provider>;
};

export const useFlipBridge = () => useContext(Ctx);
