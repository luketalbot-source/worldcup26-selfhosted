import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { sql, withUser } from "../db";
import { requireAuth, requireAdmin, type AuthEnv } from "../auth/middleware";

const router = new Hono<AuthEnv>();

router.get("/awards", async (c) => {
  const rows = await sql`SELECT * FROM boost_awards ORDER BY display_order ASC`;
  return c.json(rows);
});

router.get("/predictions", requireAuth, async (c) => {
  const user = c.get("user");
  const tenantId = c.req.query("tenant_id");
  if (!tenantId) return c.json({ error: "tenant_id is required" }, 400);

  const rows = await withUser(user.sub, (tx) =>
    tx`
      SELECT * FROM boost_predictions
      WHERE user_id = ${user.sub} AND tenant_id = ${tenantId}
    `
  );
  return c.json(rows);
});

router.post(
  "/predictions",
  requireAuth,
  zValidator(
    "json",
    z.object({
      award_id: z.string().uuid(),
      predicted_team_code: z.string().nullable().optional(),
      predicted_player_name: z.string().nullable().optional(),
      tenant_id: z.string().uuid(),
    })
  ),
  async (c) => {
    const user = c.get("user");
    const body = c.req.valid("json");

    const rows = await withUser(user.sub, (tx) =>
      tx`
        INSERT INTO boost_predictions (
          id, user_id, award_id, predicted_team_code, predicted_player_name, tenant_id, created_at, updated_at
        )
        VALUES (
          gen_random_uuid(), ${user.sub}, ${body.award_id},
          ${body.predicted_team_code ?? null}, ${body.predicted_player_name ?? null},
          ${body.tenant_id}, NOW(), NOW()
        )
        ON CONFLICT (user_id, award_id) DO UPDATE
          SET predicted_team_code   = EXCLUDED.predicted_team_code,
              predicted_player_name = EXCLUDED.predicted_player_name,
              tenant_id             = EXCLUDED.tenant_id,
              updated_at            = NOW()
        RETURNING *
      `
    );
    return c.json(rows[0], 201);
  }
);

router.get("/results", async (c) => {
  const rows = await sql`SELECT * FROM boost_results`;
  return c.json(rows);
});

router.post(
  "/results",
  requireAdmin,
  zValidator(
    "json",
    z.object({
      award_id: z.string().uuid(),
      result_team_code: z.string().nullable().optional(),
      result_player_name: z.string().nullable().optional(),
    })
  ),
  async (c) => {
    const body = c.req.valid("json");
    const rows = await sql`
      INSERT INTO boost_results (id, award_id, result_team_code, result_player_name, created_at, updated_at)
      VALUES (
        gen_random_uuid(), ${body.award_id},
        ${body.result_team_code ?? null}, ${body.result_player_name ?? null},
        NOW(), NOW()
      )
      ON CONFLICT (award_id) DO UPDATE
        SET result_team_code   = EXCLUDED.result_team_code,
            result_player_name = EXCLUDED.result_player_name,
            updated_at         = NOW()
      RETURNING *
    `;
    return c.json(rows[0], 201);
  }
);

router.delete("/results/:awardId", requireAdmin, async (c) => {
  const awardId = c.req.param("awardId");
  await sql`DELETE FROM boost_results WHERE award_id = ${awardId}`;
  return c.json({ ok: true });
});

router.delete("/results", requireAdmin, async (c) => {
  await sql`DELETE FROM boost_results`;
  return c.json({ ok: true });
});

router.patch(
  "/awards/:id",
  requireAdmin,
  zValidator("json", z.object({ points_value: z.number().int().min(0) })),
  async (c) => {
    const id = c.req.param("id");
    const { points_value } = c.req.valid("json");
    const rows = await sql`
      UPDATE boost_awards SET points_value = ${points_value} WHERE id = ${id} RETURNING *
    `;
    if (rows.length === 0) return c.json({ error: "Award not found" }, 404);
    return c.json(rows[0]);
  }
);

export default router;
