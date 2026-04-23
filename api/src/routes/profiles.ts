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

// display_name is intentionally NOT editable via this endpoint — it's
// derived from the OIDC claims on every login (see upsertOidcUser in
// auth.ts). Users can change their emoji + consent timestamp only.
const patchSchema = z.object({
  avatar_emoji: z.string().optional(),
  privacy_consent_at: z.string().datetime().optional(),
}).strict();

router.patch("/me", requireAuth, zValidator("json", patchSchema), async (c) => {
  const user = c.get("user");
  const body = c.req.valid("json");

  const rows = await withUser(user.sub, (tx) =>
    tx`
      UPDATE profiles
      SET
        avatar_emoji     = COALESCE(${body.avatar_emoji ?? null}, avatar_emoji),
        privacy_consent_at = COALESCE(${body.privacy_consent_at ?? null}::timestamptz, privacy_consent_at),
        updated_at       = NOW()
      WHERE user_id = ${user.sub}
      RETURNING *
    `
  );

  if (rows.length === 0) return c.json({ error: "Profile not found" }, 404);
  return c.json(rows[0]);
});

export default router;
