import { Hono } from "hono";
import { type AuthEnv } from "../auth/middleware";
import { buildTeamsPayload } from "./competitions";

// Back-compat alias: GET /api/wc2026/teams predates the multi-competition
// platform. It now serves the wc-2026 competition's roster through the same
// code path as GET /api/competitions/:slug/teams so deployed frontends keep
// working during the transition. New code should use the competitions route.

const router = new Hono<AuthEnv>();

router.get("/teams", async (c) => {
  const payload = await buildTeamsPayload("wc-2026");
  if (!payload) return c.json({ error: "Unknown competition" }, 404);
  c.header("Cache-Control", "public, max-age=300, stale-while-revalidate=900");
  // Byte-identical to the pre-multi-competition response: the alias strips
  // the `competition` field the generic endpoint adds.
  const { competition: _competition, ...legacyShape } = payload;
  return c.json(legacyShape);
});

export default router;
