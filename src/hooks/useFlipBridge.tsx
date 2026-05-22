import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { useTheme } from 'next-themes';
import { useTranslation } from 'react-i18next';

/**
 * Per-signal detection state. Surface in a UI diagnostic panel when we
 * can't reach DevTools (i.e. mobile WebView debugging). Each field maps
 * to one possible mobile/embed transport, so a screenshot tells us
 * which mechanism the host actually uses without remote-attaching.
 */
export interface FlipBridgeDiag {
  /** True if window.parent !== window (iframe embed). */
  inIframe: boolean;
  /** True if `FlipFlutter` showed up in `window` at any point during detection. */
  flipFlutter: 'present-at-mount' | 'appeared-during-poll' | 'never';
  /** iOS WKWebView native bridge. */
  webkitMessageHandlers: boolean;
  /** Android WebView Java->JS interface. */
  androidInterface: boolean;
  /** UA string truncated for the panel (full string still logged to console). */
  userAgent: string;
  /** ms from mount until isEmbedded resolved (or `null` if unresolved). */
  resolvedAtMs: number | null;
}

interface FlipBridgeState {
  /**
   * Tri-state — embedded inside a Flip host (web iframe or Flutter WebView).
   *
   * - `null`  — detection still in progress. Hide host-controlled UI
   *             (e.g. theme picker) during this window: a brief flash of
   *             "extra" controls on mobile looks worse than a brief
   *             delay before they appear in true-standalone mode.
   * - `true`  — confirmed running inside a Flip host.
   * - `false` — confirmed standalone (no host detected within
   *             EMBED_DETECTION_TIMEOUT_MS).
   */
  isEmbedded: boolean | null;
  /** True when the Flip bridge has completed its initial theme/lang handshake. */
  bridgeReady: boolean;
  /** Last error the bridge surfaced, if any — handy for debugging in prod. */
  error: string | null;
  /** Snapshot of all detection signals. Surfaced as a debug panel in ProfileView. */
  diag: FlipBridgeDiag;
}

function emptyDiag(): FlipBridgeDiag {
  return {
    inIframe: typeof window !== 'undefined' && window.parent !== window,
    flipFlutter: 'never',
    webkitMessageHandlers: false,
    androidInterface: false,
    userAgent: typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 120) : '',
    resolvedAtMs: null,
  };
}

const Ctx = createContext<FlipBridgeState>({
  isEmbedded: null,
  bridgeReady: false,
  error: null,
  diag: emptyDiag(),
});

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
 *    and the iframe check fails.
 *
 * Important wrinkle: Flutter sometimes injects `FlipFlutter` via
 * `evaluateJavascript` *after* our React app's initial render, so a
 * one-shot synchronous check at mount can miss it. `checkEmbedded` is
 * called repeatedly by the polling loop below until the host appears or
 * we time out.
 */
function checkEmbedded(): boolean {
  if (typeof window === 'undefined') return false;
  const inIframe = window.parent !== window;
  const inFlutter = 'FlipFlutter' in window;
  return inIframe || inFlutter;
}

// How long to wait for a host to show up before deciding we're standalone.
// 3 s comfortably absorbs Flutter's late-injection window on real devices
// without making the standalone web app feel laggy on first paint.
const EMBED_DETECTION_TIMEOUT_MS = 3000;
const EMBED_POLL_INTERVAL_MS = 100;

// How long we wait for a host response on bridge requests/subscriptions
// before giving up. The bridge SDK's `makeRequest` has no native timeout
// — if the host doesn't reply we hang forever, which silently blocked
// `bridgeReady` from ever transitioning to true on iOS (the Flip mobile
// app's SUBSCRIBE handler appears not to send back a confirmation).
// 5 s is comfortably longer than any healthy round-trip but short enough
// that a non-responsive host doesn't keep React state half-resolved.
const BRIDGE_CALL_TIMEOUT_MS = 5000;

const BRIDGE_TIMEOUT_SENTINEL = Symbol('bridge-call-timeout');

/**
 * Race a bridge promise against a timer. Returns the resolved value or
 * the sentinel symbol on timeout — caller branches with `===
 * BRIDGE_TIMEOUT_SENTINEL`. Sentinel-vs-value avoids the boolean-soup
 * trap of using `null` (some bridge errors are nullish themselves).
 */
function withBridgeTimeout<T>(
  p: Promise<T>,
  ms: number,
): Promise<T | typeof BRIDGE_TIMEOUT_SENTINEL> {
  return Promise.race([
    p,
    new Promise<typeof BRIDGE_TIMEOUT_SENTINEL>((resolve) =>
      setTimeout(() => resolve(BRIDGE_TIMEOUT_SENTINEL), ms),
    ),
  ]);
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
    // Tri-state. Start as null so consumers (e.g. ProfileView's theme
    // picker) treat detection as in-progress and hide host-controlled UI
    // until we know for sure. See the FlipBridgeState type for rationale.
    isEmbedded: null,
    bridgeReady: false,
    error: null,
    diag: emptyDiag(),
  });

  // Detection effect. Runs once on mount and polls briefly for the host
  // to appear (handles Flutter's late `FlipFlutter` injection — that
  // object is sometimes set via evaluateJavascript *after* our first
  // render, so a synchronous check returns false even though the bridge
  // is going to work fine a moment later). Settles isEmbedded to true
  // as soon as the host is detected, or to false if we time out.
  //
  // Also captures every detection signal into state.diag so a UI panel
  // (rendered in ProfileView for mobile debugging) can surface what's
  // present in the WebView without needing a remote-attached console.
  useEffect(() => {
    if (typeof window === 'undefined') {
      setState((s) => ({ ...s, isEmbedded: false }));
      return;
    }

    const startedAt = Date.now();
    const w = window as unknown as {
      webkit?: { messageHandlers?: unknown };
      Android?: unknown;
    };
    const baseDiag: FlipBridgeDiag = {
      inIframe: window.parent !== window,
      flipFlutter: 'FlipFlutter' in window ? 'present-at-mount' : 'never',
      webkitMessageHandlers: typeof w.webkit?.messageHandlers === 'object',
      androidInterface: typeof w.Android !== 'undefined',
      userAgent: navigator.userAgent.slice(0, 120),
      resolvedAtMs: null,
    };

    console.log(`${TAG} mount diag:`, {
      ...baseDiag,
      fullUA: navigator.userAgent,
      windowKeys: Object.keys(window).filter((k) =>
        /flip|bridge|webkit|android|native|host/i.test(k),
      ),
    });

    if (checkEmbedded()) {
      const transport = 'FlipFlutter' in window ? 'flutter-webview' : 'iframe';
      const resolvedAtMs = Date.now() - startedAt;
      console.log(`${TAG} host detected at mount (${transport})`);
      setState((s) => ({
        ...s,
        isEmbedded: true,
        diag: { ...baseDiag, resolvedAtMs },
      }));
      return;
    }

    console.log(`${TAG} no host at mount — polling ${EMBED_DETECTION_TIMEOUT_MS}ms for late injection`);
    setState((s) => ({ ...s, diag: baseDiag }));

    let settled = false;
    const id = setInterval(() => {
      if (settled) return;
      if (checkEmbedded()) {
        settled = true;
        clearInterval(id);
        const transport = 'FlipFlutter' in window ? 'flutter-webview' : 'iframe';
        const resolvedAtMs = Date.now() - startedAt;
        console.log(`${TAG} host appeared after ${resolvedAtMs}ms (${transport})`);
        setState((s) => ({
          ...s,
          isEmbedded: true,
          diag: {
            ...s.diag,
            flipFlutter:
              'FlipFlutter' in window && s.diag.flipFlutter === 'never'
                ? 'appeared-during-poll'
                : s.diag.flipFlutter,
            inIframe: window.parent !== window,
            resolvedAtMs,
          },
        }));
        return;
      }
      if (Date.now() - startedAt >= EMBED_DETECTION_TIMEOUT_MS) {
        settled = true;
        clearInterval(id);
        const resolvedAtMs = Date.now() - startedAt;
        console.log(`${TAG} no host detected within ${EMBED_DETECTION_TIMEOUT_MS}ms — standalone. final diag:`, { ...baseDiag, resolvedAtMs });
        setState((s) => ({
          ...s,
          isEmbedded: false,
          diag: { ...s.diag, resolvedAtMs },
        }));
      }
    }, EMBED_POLL_INTERVAL_MS);
    return () => {
      settled = true;
      clearInterval(id);
    };
  }, []);

  // Bridge wire-up effect. Fires once isEmbedded resolves to true. The
  // detection effect above guarantees this only runs when a host is
  // actually present (sync at mount on web iframe, after polling on
  // Flutter mobile).
  useEffect(() => {
    if (state.isEmbedded !== true) {
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

        // Theme handshake. Wrapped in withBridgeTimeout so a
        // non-responsive host can't hang us — the bridge SDK's
        // underlying makeRequest has no native timeout.
        try {
          const theme = await withBridgeTimeout(getTheme(), BRIDGE_CALL_TIMEOUT_MS);
          if (theme === BRIDGE_TIMEOUT_SENTINEL) {
            console.warn(`${TAG} getTheme timed out after ${BRIDGE_CALL_TIMEOUT_MS}ms`);
          } else {
            console.log(`${TAG} getTheme →`, theme);
            if (isBridgeError(theme)) {
              console.warn(`${TAG} getTheme returned BridgeError:`, theme);
            } else {
              const active = theme?.activeTheme;
              if (!cancelled && (active === 'light' || active === 'dark')) {
                setTheme(active);
              }
            }
          }
        } catch (err) {
          console.warn(`${TAG} getTheme rejected (host may not expose theme):`, err);
        }

        // Initial language handshake. getLang resolves with either a string
        // or `{ code: BridgeErrorCode }` — branch on both.
        //
        // Manual-override check: if the user has explicitly picked a
        // language via ProfileView's language picker, that pick wins
        // over the host's announcement. Without this, every iframe
        // mount would silently revert to the host's locale and the
        // in-app picker would feel broken ("I clicked French, why is
        // it German again?"). See ProfileView for where the flag is
        // set.
        let langOverride = false;
        try {
          langOverride = localStorage.getItem('flipLangOverride') === '1';
        } catch { /* private-mode storage; treat as no override */ }
        if (langOverride) {
          console.log(`${TAG} skipping host language sync — user has manually overridden`);
        } else {
          try {
            const lang = await withBridgeTimeout(getLang(), BRIDGE_CALL_TIMEOUT_MS);
            if (lang === BRIDGE_TIMEOUT_SENTINEL) {
              console.warn(`${TAG} getLang timed out after ${BRIDGE_CALL_TIMEOUT_MS}ms`);
            } else {
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
            }
          } catch (err) {
            console.warn(`${TAG} getLang rejected:`, err);
          }
        }

        // Subscribe to future theme changes. Subscribe is also timeout-wrapped
        // — on iOS the Flip mobile app appears not to confirm SUBSCRIBE
        // requests, so a bare `await subscribe(...)` would hang forever and
        // block bridgeReady from ever flipping true.
        try {
          const sub = await withBridgeTimeout(
            subscribe(
              BridgeEventType.THEME_CHANGE,
              (event: { data?: { activeTheme?: 'light' | 'dark' } }) => {
                const next = event.data?.activeTheme;
                console.log(`${TAG} THEME_CHANGE →`, next);
                if (next === 'light' || next === 'dark') setTheme(next);
              },
            ),
            BRIDGE_CALL_TIMEOUT_MS,
          );
          if (sub === BRIDGE_TIMEOUT_SENTINEL) {
            console.warn(`${TAG} subscribe(THEME_CHANGE) timed out — live host theme events won't fire`);
          } else {
            unsubscribeTheme = sub;
            console.log(`${TAG} subscribed to THEME_CHANGE`);
          }
        } catch (err) {
          console.warn(`${TAG} subscribe(THEME_CHANGE) rejected:`, err);
        }

        // Subscribe to language changes. When the user changes language in
        // Flip after the iframe has loaded, we re-apply it here. Event
        // payload shape: { data: <langCode> } based on the bridge SDK's
        // existing patterns — we defensively support both bare-string and
        // wrapped-object payloads.
        try {
          const sub = await withBridgeTimeout(
            subscribe(
              BridgeEventType.LANG_CHANGE,
              (event: { data?: unknown }) => {
                // Re-read the override flag on every event — the user
                // might have set it AFTER subscribe time, in which case
                // we still need to honour it. Reading localStorage is
                // cheap and synchronous; no need to cache.
                let override = false;
                try {
                  override = localStorage.getItem('flipLangOverride') === '1';
                } catch { /* ignore */ }
                if (override) {
                  console.log(`${TAG} LANG_CHANGE ignored — user has manually overridden`);
                  return;
                }
                // Some bridge implementations deliver the new lang as the
                // bare event.data; others wrap it. Try both.
                const raw =
                  typeof event.data === 'string'
                    ? event.data
                    : (event.data as { lang?: string; activeLang?: string } | undefined)?.lang ??
                      (event.data as { activeLang?: string } | undefined)?.activeLang;
                const next = normaliseLang(raw);
                console.log(`${TAG} LANG_CHANGE →`, event.data, '→ normalised:', next);
                if (next && i18n.language !== next) i18n.changeLanguage(next);
              },
            ),
            BRIDGE_CALL_TIMEOUT_MS,
          );
          if (sub === BRIDGE_TIMEOUT_SENTINEL) {
            console.warn(`${TAG} subscribe(LANG_CHANGE) timed out — live host language events won't fire`);
          } else {
            unsubscribeLang = sub;
            console.log(`${TAG} subscribed to LANG_CHANGE`);
          }
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
