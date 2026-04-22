import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { withUser } from "../db";
import { requireAuth, type AuthEnv } from "../auth/middleware";

const router = new Hono<AuthEnv>();

router.get("/", requireAuth, async (c) => {
  const user = c.get("user");
  const tenantId = c.req.query("tenant_id");

  // Tenant filter is optional — admins may fetch cross-tenant rows
  const rows = await withUser(user.sub, (tx) =>
    tenantId
      ? tx`
          SELECT * FROM predictions
          WHERE user_id = ${user.sub} AND tenant_id = ${tenantId}
          ORDER BY created_at DESC
        `
      : tx`
          SELECT * FROM predictions
          WHERE user_id = ${user.sub}
          ORDER BY created_at DESC
        `
  );
  return c.json(rows);
});

// Match_id is the TEXT business key (e.g. "GROUP_STAGE-A-MEX-SCO-1"),
// NOT the live_matches.id UUID. home_score / away_score are the columns
// on the predictions table (no "predicted_" prefix in the schema).
const predictionSchema = z.object({
  match_id:   z.string().min(1),
  home_score: z.number().int().min(0),
  away_score: z.number().int().min(0),
  tenant_id:  z.string().uuid().optional(),
});

router.post("/", requireAuth, zValidator("json", predictionSchema), async (c) => {
  const user = c.get("user");
  const body = c.req.valid("json");

  const rows = await withUser(user.sub, (tx) =>
    tx`
      INSERT INTO predictions (id, user_id, match_id, home_score, away_score, tenant_id, created_at, updated_at)
      VALUES (
        gen_random_uuid(),
        ${user.sub},
        ${body.match_id},
        ${body.home_score},
        ${body.away_score},
        ${body.tenant_id ?? null},
        NOW(), NOW()
      )
      ON CONFLICT (user_id, match_id) DO UPDATE
        SET home_score = EXCLUDED.home_score,
            away_score = EXCLUDED.away_score,
            tenant_id  = EXCLUDED.tenant_id,
            updated_at = NOW()
      RETURNING *
    `
  );
  return c.json(rows[0], 201);
});

export default router;
