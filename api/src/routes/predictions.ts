import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { withUser } from "../db";
import { requireAuth, type AuthEnv } from "../auth/middleware";

const router = new Hono<AuthEnv>();

router.get("/", requireAuth, async (c) => {
  const user = c.get("user");
  const tenantId = c.req.query("tenant_id");
  if (!tenantId) return c.json({ error: "tenant_id is required" }, 400);

  const rows = await withUser(user.sub, (tx) =>
    tx`
      SELECT * FROM predictions
      WHERE user_id = ${user.sub} AND tenant_id = ${tenantId}
      ORDER BY created_at DESC
    `
  );
  return c.json(rows);
});

const predictionSchema = z.object({
  match_id: z.string().uuid(),
  predicted_home_score: z.number().int().min(0),
  predicted_away_score: z.number().int().min(0),
  tenant_id: z.string().uuid(),
});

router.post("/", requireAuth, zValidator("json", predictionSchema), async (c) => {
  const user = c.get("user");
  const body = c.req.valid("json");

  const rows = await withUser(user.sub, (tx) =>
    tx`
      INSERT INTO predictions (id, user_id, match_id, predicted_home_score, predicted_away_score, tenant_id, created_at, updated_at)
      VALUES (gen_random_uuid(), ${user.sub}, ${body.match_id}, ${body.predicted_home_score}, ${body.predicted_away_score}, ${body.tenant_id}, NOW(), NOW())
      ON CONFLICT (user_id, match_id) DO UPDATE
        SET predicted_home_score = EXCLUDED.predicted_home_score,
            predicted_away_score = EXCLUDED.predicted_away_score,
            tenant_id = EXCLUDED.tenant_id,
            updated_at = NOW()
      RETURNING *
    `
  );
  return c.json(rows[0], 201);
});

export default router;
