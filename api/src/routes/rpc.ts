import { Hono } from "hono";
import { sql } from "../db";
import { requireAuth, type AuthEnv } from "../auth/middleware";

const router = new Hono<AuthEnv>();

router.get("/is_any_admin", requireAuth, async (c) => {
  const user = c.get("user");
  const rows = await sql<{ exists: boolean }[]>`
    SELECT EXISTS(
      SELECT 1 FROM user_roles WHERE user_id = ${user.sub} AND role = 'admin'
    ) AS exists
  `;
  return c.json({ is_admin: rows[0]?.exists ?? false });
});

export default router;
