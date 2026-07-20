// Single choke point for ALL football-data.org traffic.
//
// Why: the free/low tier allows ~10 requests/min ACROSS the whole key. With
// one competition the old code could eyeball the budget (2 list calls + a
// capped number of detail fetches per tick). With N competitions syncing
// through one shared key, ad-hoc pacing stops being auditable — so every FD
// request now flows through this module's token bucket, and 429 handling
// lives in exactly one place (previously there was none: a 429 just failed
// that fetch silently).
//
// Design:
//   - Sliding-window rate limit: at most `reqsPerMin` requests in any 60s
//     window (default 8 — headroom of 2 under the tier's 10 for admin-
//     triggered syncs racing the scheduler, players sync, etc.).
//   - Global cooldown on 429: FD's 429 body says how long to wait
//     ("Wait N seconds…"); we honour it (falling back to 60s), park ALL
//     callers until it elapses, then retry the failed request once.
//   - Callers just `await fdFetch(path)` — ordering is FIFO, no starvation.
//
// Everything time/fetch-shaped is injectable so the unit tests can drive the
// bucket deterministically without wall-clock sleeps.

export interface FdClientDeps {
  fetchImpl?: typeof fetch;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  reqsPerMin?: number;
}

export interface FdClient {
  /** Rate-limited fetch against the FD API. `path` starts with '/'. */
  fdFetch(path: string, apiKey: string): Promise<Response>;
  /** Milliseconds until a request could run now (0 = immediately). For logs/tests. */
  currentDelayMs(): number;
}

const FOOTBALL_API_BASE = "https://api.football-data.org/v4";
const WINDOW_MS = 60_000;
const DEFAULT_REQS_PER_MIN = 8;
const DEFAULT_COOLDOWN_MS = 60_000;

/** Parse FD's 429 hint. Body typically reads "…Wait 24 seconds…"; also
 *  honours a standard Retry-After seconds header. Returns ms. */
export function parseRetryAfterMs(body: string, retryAfterHeader: string | null): number {
  const header = Number(retryAfterHeader);
  if (Number.isFinite(header) && header > 0) return header * 1000;
  const m = body.match(/wait\s+(\d+)\s*second/i);
  if (m) return Number(m[1]) * 1000;
  return DEFAULT_COOLDOWN_MS;
}

export function createFdClient(deps: FdClientDeps = {}): FdClient {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const now = deps.now ?? Date.now;
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const reqsPerMin = deps.reqsPerMin ?? DEFAULT_REQS_PER_MIN;

  // Timestamps of the last `reqsPerMin` requests (sliding window).
  const sent: number[] = [];
  let cooldownUntil = 0;
  // FIFO fairness: each caller chains onto the previous one's completion of
  // the ACQUIRE step (not the whole fetch — requests may overlap in flight).
  let queueTail: Promise<void> = Promise.resolve();

  function delayMs(): number {
    const t = now();
    let wait = Math.max(0, cooldownUntil - t);
    if (sent.length >= reqsPerMin) {
      const windowFree = sent[sent.length - reqsPerMin] + WINDOW_MS - t;
      wait = Math.max(wait, windowFree);
    }
    return wait;
  }

  async function acquire(): Promise<void> {
    // Loop: cooldown may be extended by another caller's 429 while we slept.
    for (;;) {
      const wait = delayMs();
      if (wait <= 0) break;
      await sleep(wait);
    }
    sent.push(now());
    // Keep the window array bounded.
    if (sent.length > reqsPerMin * 2) sent.splice(0, sent.length - reqsPerMin);
  }

  async function fdFetch(path: string, apiKey: string): Promise<Response> {
    const doAcquire = queueTail.then(acquire);
    // The tail must survive an individual caller's failure.
    queueTail = doAcquire.catch(() => {});
    await doAcquire;

    let res = await fetchImpl(`${FOOTBALL_API_BASE}${path}`, {
      headers: { "X-Auth-Token": apiKey },
    });
    if (res.status !== 429) return res;

    // 429: park EVERY caller for FD's hinted duration, then retry once.
    // The retry goes back through acquire() so it (a) re-checks the
    // cooldown in a loop — another in-flight caller's 429 may have
    // extended it while we slept — and (b) respects the sliding window,
    // so several parked retries can't all burst at cooldown expiry.
    const hint = parseRetryAfterMs(await res.text().catch(() => ""), res.headers.get("retry-after"));
    cooldownUntil = Math.max(cooldownUntil, now() + hint);
    console.warn(`[fd-client] 429 from FD — cooling down ${Math.round(hint / 1000)}s`);
    await acquire();
    res = await fetchImpl(`${FOOTBALL_API_BASE}${path}`, {
      headers: { "X-Auth-Token": apiKey },
    });
    return res;
  }

  return { fdFetch, currentDelayMs: delayMs };
}

// The shared production instance. Tests build their own via createFdClient.
export const fdClient = createFdClient();
