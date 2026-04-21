import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { sql, withUser } from "../db";
import { requireAuth, requireAdmin, type AuthEnv } from "../auth/middleware";

const router = new Hono<AuthEnv>();

// Custom boosts CRUD
router.get("/", async (c) => {
  const tenantId = c.req.query("tenant_id");
  if (!tenantId) return c.json({ error: "tenant_id is required" }, 400);
  const rows = await sql`SELECT * FROM tenant_custom_boosts WHERE tenant_id = ${tenantId} ORDER BY created_at ASC`;
  return c.json(rows);
});

const createBoostSchema = z.object({
  tenant_id: z.string().uuid(),
  title: z.string().min(1),
  description: z.string().optional(),
  points_value: z.number().int().min(0),
  prediction_type: z.string(),
  image_url: z.string().url().optional(),
  lock_date: z.string().datetime().optional(),
});

router.post("/", requireAdmin, zValidator("json", createBoostSchema), async (c) => {
  const body = c.req.valid("json");
  const rows = await sql`
    INSERT INTO tenant_custom_boosts (id, tenant_id, title, description, points_value, prediction_type, image_url, lock_date, created_at, updated_at)
    VALUES (
      gen_random_uuid(), ${body.tenant_id}, ${body.title}, ${body.description ?? null},
      ${body.points_value}, ${body.prediction_type}, ${body.image_url ?? null},
      ${body.lock_date ?? null}::timestamptz, NOW(), NOW()
    )
    RETURNING *
  `;
  return c.json(rows[0], 201);
});

const patchBoostSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().optional(),
  points_value: z.number().int().min(0).optional(),
  prediction_type: z.string().optional(),
  image_url: z.string().url().nullable().optional(),
  lock_date: z.string().datetime().nullable().optional(),
});

router.patch("/:id", requireAdmin, zValidator("json", patchBoostSchema), async (c) => {
  const id = c.req.param("id");
  const body = c.req.valid("json");
  const rows = await sql`
    UPDATE tenant_custom_boosts
    SET
      title          = COALESCE(${body.title ?? null}, title),
      description    = COALESCE(${body.description ?? null}, description),
      points_value   = COALESCE(${body.points_value ?? null}, points_value),
      prediction_type = COALESCE(${body.prediction_type ?? null}, prediction_type),
      image_url      = COALESCE(${body.image_url ?? null}, image_url),
      lock_date      = COALESCE(${body.lock_date ?? null}::timestamptz, lock_date),
      updated_at     = NOW()
    WHERE id = ${id}
    RETURNING *
  `;
  if (rows.length === 0) return c.json({ error: "Custom boost not found" }, 404);
  return c.json(rows[0]);
});

router.delete("/:id", requireAdmin, async (c) => {
  const id = c.req.param("id");
  await sql`DELETE FROM tenant_custom_boosts WHERE id = ${id}`;
  return c.json({ ok: true });
});

// Custom boost predictions
router.get("/predictions", requireAuth, async (c) => {
  const user = c.get("user");
  const tenantId = c.req.query("tenant_id");
  if (!tenantId) return c.json({ error: "tenant_id is required" }, 400);

  const rows = await withUser(user.sub, (tx) =>
    tx`
      SELECT p.* FROM tenant_custom_boost_predictions p
      INNER JOIN tenant_custom_boosts b ON b.id = p.custom_boost_id
      WHERE p.user_id = ${user.sub} AND b.tenant_id = ${tenantId}
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
      custom_boost_id: z.string().uuid(),
      predicted_value: z.string(),
    })
  ),
  async (c) => {
    const user = c.get("user");
    const body = c.req.valid("json");

    const rows = await withUser(user.sub, (tx) =>
      tx`
        INSERT INTO tenant_custom_boost_predictions (id, user_id, custom_boost_id, predicted_value, created_at, updated_at)
        VALUES (gen_random_uuid(), ${user.sub}, ${body.custom_boost_id}, ${body.predicted_value}, NOW(), NOW())
        ON CONFLICT (user_id, custom_boost_id) DO UPDATE
          SET predicted_value = EXCLUDED.predicted_value,
              updated_at = NOW()
        RETURNING *
      `
    );
    return c.json(rows[0], 201);
  }
);

// Custom boost results
router.get("/results", async (c) => {
  const tenantId = c.req.query("tenant_id");
  if (!tenantId) return c.json({ error: "tenant_id is required" }, 400);

  const rows = await sql`
    SELECT r.*
    FROM tenant_custom_boost_results r
    INNER JOIN tenant_custom_boosts b ON b.id = r.custom_boost_id
    WHERE b.tenant_id = ${tenantId}
  `;
  return c.json(rows);
});

router.post(
  "/results",
  requireAdmin,
  zValidator(
    "json",
    z.object({
      custom_boost_id: z.string().uuid(),
      result_value: z.string(),
    })
  ),
  async (c) => {
    const body = c.req.valid("json");
    const rows = await sql`
      INSERT INTO tenant_custom_boost_results (id, custom_boost_id, result_value, created_at)
      VALUES (gen_random_uuid(), ${body.custom_boost_id}, ${body.result_value}, NOW())
      ON CONFLICT (custom_boost_id) DO UPDATE
        SET result_value = EXCLUDED.result_value
      RETURNING *
    `;
    return c.json(rows[0], 201);
  }
);

router.delete("/results/:boostId", requireAdmin, async (c) => {
  const boostId = c.req.param("boostId");
  await sql`DELETE FROM tenant_custom_boost_results WHERE custom_boost_id = ${boostId}`;
  return c.json({ ok: true });
});

// Translation via Gemini
router.post(
  "/translate",
  requireAuth,
  zValidator(
    "json",
    z.object({
      title: z.string(),
      description: z.string().optional(),
      sourceLanguage: z.string(),
      targetLanguage: z.string(),
    })
  ),
  async (c) => {
    const body = c.req.valid("json");
    const apiKey = process.env.GOOGLE_AI_API_KEY;
    if (!apiKey) return c.json({ error: "GOOGLE_AI_API_KEY not configured" }, 500);

    const systemPrompt = `You are a translator. Translate the provided JSON fields from ${body.sourceLanguage} to ${body.targetLanguage}. Return only a JSON object with the translated fields. Do not add explanation.`;
    const userContent = JSON.stringify({ title: body.title, description: body.description });

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/openai/chat/completions`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: "gemini-2.5-flash",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userContent },
          ],
          response_format: { type: "json_object" },
        }),
      }
    );

    if (!res.ok) return c.json({ error: "Translation failed" }, 502);
    const data = await res.json() as any;
    const content = data.choices?.[0]?.message?.content;
    if (!content) return c.json({ error: "Empty translation response" }, 502);

    try {
      const translated = JSON.parse(content);
      return c.json({ title: translated.title, description: translated.description ?? null });
    } catch {
      return c.json({ error: "Failed to parse translation response" }, 502);
    }
  }
);

export default router;
