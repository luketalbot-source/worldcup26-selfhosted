import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { sql } from "../db";
import { requireAdmin, type AuthEnv } from "../auth/middleware";

const router = new Hono<AuthEnv>();

router.delete("/users/:userId", requireAdmin, async (c) => {
  const userId = c.req.param("userId");
  await sql`DELETE FROM public.users WHERE id = ${userId}`;
  return c.json({ ok: true });
});

router.post(
  "/generate-boost-image",
  requireAdmin,
  zValidator(
    "json",
    z.object({
      boostId: z.string().uuid(),
      title: z.string(),
      description: z.string().optional(),
    })
  ),
  async (c) => {
    const body = c.req.valid("json");
    const apiKey = process.env.GOOGLE_AI_API_KEY;
    if (!apiKey) return c.json({ error: "GOOGLE_AI_API_KEY not configured" }, 500);

    const prompt = `Generate a vivid, eye-catching sports prediction image for a World Cup 2026 boost award. Title: "${body.title}"${body.description ? `. Description: "${body.description}"` : ""}. Style: modern, energetic, football/soccer themed.`;

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/imagen-3.0-generate-002:predict?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          instances: [{ prompt }],
          parameters: { sampleCount: 1, aspectRatio: "1:1" },
        }),
      }
    );

    if (!res.ok) {
      const errText = await res.text();
      console.error("Imagen API error:", errText);
      return c.json({ error: "Image generation failed" }, 502);
    }

    const data = await res.json() as any;
    const b64 = data.predictions?.[0]?.bytesBase64Encoded;
    if (!b64) return c.json({ error: "No image returned" }, 502);

    // Store as data URL (or upload to object storage in production)
    const imageUrl = `data:image/png;base64,${b64}`;

    await sql`
      UPDATE tenant_custom_boosts SET image_url = ${imageUrl}, updated_at = NOW()
      WHERE id = ${body.boostId}
    `;

    return c.json({ imageUrl });
  }
);

export default router;
