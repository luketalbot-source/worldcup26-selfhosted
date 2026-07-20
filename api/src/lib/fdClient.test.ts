// fdClient: the shared football-data.org choke point. These pin the two
// behaviors the multi-competition sync depends on — the sliding-window
// rate limit and the global 429 cooldown+retry. Deterministic via injected
// clock/sleep; no wall-clock waits. Run: `bun test` (in api/).
import { describe, expect, test } from "bun:test";
import { createFdClient, parseRetryAfterMs } from "./fdClient";

function makeHarness(reqsPerMin: number) {
  let t = 0;
  const sleeps: number[] = [];
  const calls: { path: string; at: number }[] = [];
  let responses: Array<() => Response> = [];
  const client = createFdClient({
    reqsPerMin,
    now: () => t,
    sleep: async (ms) => {
      sleeps.push(ms);
      t += ms; // advancing the clock IS the sleep
    },
    fetchImpl: (async (url: string | URL | Request) => {
      calls.push({ path: String(url), at: t });
      const next = responses.shift();
      return next ? next() : new Response("{}", { status: 200 });
    }) as typeof fetch,
  });
  return {
    client,
    calls,
    sleeps,
    queue: (...r: Array<() => Response>) => { responses = r; },
    time: () => t,
    advance: (ms: number) => { t += ms; },
  };
}

describe("fdClient rate limiting", () => {
  test("requests under the limit run immediately", async () => {
    const h = makeHarness(3);
    await h.client.fdFetch("/a", "k");
    await h.client.fdFetch("/b", "k");
    await h.client.fdFetch("/c", "k");
    expect(h.calls.length).toBe(3);
    expect(h.sleeps.length).toBe(0);
  });

  test("request N+1 waits for the window to free", async () => {
    const h = makeHarness(2);
    await h.client.fdFetch("/a", "k"); // t=0
    h.advance(10_000);
    await h.client.fdFetch("/b", "k"); // t=10s
    await h.client.fdFetch("/c", "k"); // 3rd within 60s window → must wait until t=60s
    expect(h.calls[2]!.at).toBeGreaterThanOrEqual(60_000);
  });

  test("spaced-out requests never wait", async () => {
    const h = makeHarness(2);
    await h.client.fdFetch("/a", "k");
    h.advance(40_000);
    await h.client.fdFetch("/b", "k");
    h.advance(40_000);
    await h.client.fdFetch("/c", "k");
    expect(h.sleeps.length).toBe(0);
  });
});

describe("fdClient 429 handling", () => {
  test("429 → cooldown for FD's hinted seconds, then retry once", async () => {
    const h = makeHarness(8);
    h.queue(
      () => new Response("You reached your request limit. Wait 24 seconds.", { status: 429 }),
      () => new Response('{"ok":true}', { status: 200 }),
    );
    const res = await h.client.fdFetch("/x", "k");
    expect(res.status).toBe(200);
    expect(h.calls.length).toBe(2);
    // Retry happened only after the 24s hint elapsed.
    expect(h.calls[1]!.at - h.calls[0]!.at).toBeGreaterThanOrEqual(24_000);
  });

  test("cooldown parks SUBSEQUENT requests too", async () => {
    const h = makeHarness(8);
    h.queue(
      () => new Response("Wait 30 seconds.", { status: 429 }),
      () => new Response("{}", { status: 200 }),
      () => new Response("{}", { status: 200 }),
    );
    await h.client.fdFetch("/x", "k"); // 429 at t=0 → cooldown until t=30s (retry consumes it)
    const tAfterFirst = h.time();
    await h.client.fdFetch("/y", "k");
    // /y must not have run before the cooldown elapsed.
    expect(h.calls[2]!.at).toBeGreaterThanOrEqual(30_000);
    expect(tAfterFirst).toBeGreaterThanOrEqual(30_000);
  });
});

describe("parseRetryAfterMs", () => {
  test("prefers Retry-After header", () => {
    expect(parseRetryAfterMs("Wait 24 seconds.", "10")).toBe(10_000);
  });
  test("falls back to body hint", () => {
    expect(parseRetryAfterMs("You reached your request limit. Wait 24 seconds.", null)).toBe(24_000);
  });
  test("defaults to 60s when unparseable", () => {
    expect(parseRetryAfterMs("slow down", null)).toBe(60_000);
  });
});
