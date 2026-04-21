import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { withUser } from "../db";
import { requireAuth, type AuthEnv } from "../auth/middleware";

const router = new Hono<AuthEnv>();

router.get("/me", requireAuth, async (c) => {
  const user = c.get("user");
  const rows = await withUser(user.sub, (tx) =>
    tx`SELECT * FROM profiles WHERE user_id = ${user.sub} LIMIT 1`
  );
  if (rows.length === 0) return c.json({ error: "Profile not found" }, 404);
  return c.json(rows[0]);
});

const patchSchema = z.object({
  display_name: z.string().min(1).max(100).optional(),
  avatar_emoji: z.string().optional(),
  privacy_consent_at: z.string().datetime().optional(),
  locale: z.string().max(10).optional(),
}).strict();

router.patch("/me", requireAuth, zValidator("json", patchSchema), async (c) => {
  const user = c.get("user");
  const body = c.req.valid("json");

  const rows = await withUser(user.sub, (tx) =>
    tx`
      UPDATE profiles
      SET
        display_name     = COALESCE(${body.display_name ?? null}, display_name),
        avatar_emoji     = COALESCE(${body.avatar_emoji ?? null}, avatar_emoji),
        privacy_consent_at = COALESCE(${body.privacy_consent_at ?? null}::timestamptz, privacy_consent_at),
        locale           = COALESCE(${body.locale ?? null}, locale),
        updated_at       = NOW()
      WHERE user_id = ${user.sub}
      RETURNING *
    `
  );

  if (rows.length === 0) return c.json({ error: "Profile not found" }, 404);
  return c.json(rows[0]);
});

export default router;
