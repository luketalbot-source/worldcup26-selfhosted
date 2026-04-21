import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { withUser } from "../db";
import { requireAuth, type AuthEnv } from "../auth/middleware";

const router = new Hono<AuthEnv>();

function generateJoinCode(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

router.get("/", requireAuth, async (c) => {
  const user = c.get("user");
  const tenantId = c.req.query("tenant_id");
  if (!tenantId) return c.json({ error: "tenant_id is required" }, 400);

  const rows = await withUser(user.sub, (tx) =>
    tx`
      SELECT l.*, (SELECT COUNT(*) FROM league_members lm WHERE lm.league_id = l.id) AS member_count
      FROM leagues l
      INNER JOIN league_members lm2 ON lm2.league_id = l.id AND lm2.user_id = ${user.sub}
      WHERE l.tenant_id = ${tenantId}
      ORDER BY l.created_at DESC
    `
  );
  return c.json(rows);
});

router.post(
  "/",
  requireAuth,
  zValidator("json", z.object({ name: z.string().min(1).max(100), tenant_id: z.string().uuid() })),
  async (c) => {
    const user = c.get("user");
    const { name, tenant_id } = c.req.valid("json");

    const league = await withUser(user.sub, async (tx) => {
      let joinCode = generateJoinCode();
      // Retry on collision (extremely unlikely but safe)
      for (let i = 0; i < 5; i++) {
        const existing = await tx`SELECT id FROM leagues WHERE join_code = ${joinCode} LIMIT 1`;
        if (existing.length === 0) break;
        joinCode = generateJoinCode();
      }

      const [created] = await tx`
        INSERT INTO leagues (id, name, join_code, creator_id, tenant_id, created_at)
        VALUES (gen_random_uuid(), ${name}, ${joinCode}, ${user.sub}, ${tenant_id}, NOW())
        RETURNING *
      `;

      await tx`
        INSERT INTO league_members (id, league_id, user_id, joined_at)
        VALUES (gen_random_uuid(), ${created!.id}, ${user.sub}, NOW())
        ON CONFLICT (user_id, league_id) DO NOTHING
      `;

      return created;
    });

    return c.json(league, 201);
  }
);

router.get("/by-code/:code", requireAuth, async (c) => {
  const user = c.get("user");
  const code = c.req.param("code").toUpperCase();

  const rows = await withUser(user.sub, (tx) =>
    tx`
      SELECT l.*, (SELECT COUNT(*) FROM league_members lm WHERE lm.league_id = l.id) AS member_count
      FROM leagues l
      WHERE l.join_code = ${code}
      LIMIT 1
    `
  );
  if (rows.length === 0) return c.json({ error: "League not found" }, 404);
  return c.json(rows[0]);
});

router.post("/:id/members", requireAuth, async (c) => {
  const user = c.get("user");
  const leagueId = c.req.param("id");

  await withUser(user.sub, (tx) =>
    tx`
      INSERT INTO league_members (id, league_id, user_id, joined_at)
      VALUES (gen_random_uuid(), ${leagueId}, ${user.sub}, NOW())
      ON CONFLICT (user_id, league_id) DO NOTHING
    `
  );
  return c.json({ ok: true });
});

router.delete("/:id/members", requireAuth, async (c) => {
  const user = c.get("user");
  const leagueId = c.req.param("id");

  await withUser(user.sub, (tx) =>
    tx`DELETE FROM league_members WHERE user_id = ${user.sub} AND league_id = ${leagueId}`
  );
  return c.json({ ok: true });
});

router.delete("/:id", requireAuth, async (c) => {
  const user = c.get("user");
  const leagueId = c.req.param("id");
  const isAdmin = user.role === "admin";

  const rows = await withUser(user.sub, async (tx) => {
    const condition = isAdmin
      ? tx`DELETE FROM leagues WHERE id = ${leagueId} RETURNING id`
      : tx`DELETE FROM leagues WHERE id = ${leagueId} AND creator_id = ${user.sub} RETURNING id`;
    return condition;
  });

  if (rows.length === 0) return c.json({ error: "League not found or not authorized" }, 404);
  return c.json({ ok: true });
});

export default router;
