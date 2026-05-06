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
  zValidator(
    "json",
    z.object({
      name: z.string().min(1).max(100),
      tenant_id: z.string().uuid(),
      // The frontend EmojiPicker lets users choose any emoji as the league
      // avatar — persist it so the success card and league list both render
      // it. Optional with a sensible default trophy.
      avatar_emoji: z.string().min(1).max(16).optional(),
    })
  ),
  async (c) => {
    const user = c.get("user");
    const { name, tenant_id, avatar_emoji } = c.req.valid("json");

    const league = await withUser(user.sub, async (tx) => {
      let joinCode = generateJoinCode();
      // Retry on collision (extremely unlikely but safe)
      for (let i = 0; i < 5; i++) {
        const existing = await tx`SELECT id FROM leagues WHERE join_code = ${joinCode} LIMIT 1`;
        if (existing.length === 0) break;
        joinCode = generateJoinCode();
      }

      const [created] = await tx`
        INSERT INTO leagues (id, name, avatar_emoji, join_code, creator_id, tenant_id, created_at)
        VALUES (gen_random_uuid(), ${name}, ${avatar_emoji ?? "🏆"}, ${joinCode}, ${user.sub}, ${tenant_id}, NOW())
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

// Modify a league. Same authz model as DELETE: only the creator (or any
// global admin) can edit. Members see the league but can't change name or
// avatar. Frontend was already calling this endpoint via updateLeague —
// it just didn't exist on the backend, so every Save silently 404'd.
router.patch(
  "/:id",
  requireAuth,
  zValidator(
    "json",
    z.object({
      name: z.string().min(1).max(100).optional(),
      avatar_emoji: z.string().min(1).max(16).optional(),
    }).strict(),
  ),
  async (c) => {
    const user = c.get("user");
    const leagueId = c.req.param("id");
    const body = c.req.valid("json");
    const isAdmin = user.role === "admin";

    if (Object.keys(body).length === 0) {
      return c.json({ error: "No fields to update" }, 400);
    }

    const rows = await withUser(user.sub, async (tx) => {
      // Authz: the WHERE clause is the gate. If no row matches the
      // creator/admin condition, the UPDATE is a no-op and RETURNING is
      // empty — same semantics as DELETE above.
      if (body.name !== undefined) {
        const where = isAdmin
          ? tx`UPDATE leagues SET name = ${body.name} WHERE id = ${leagueId} RETURNING id`
          : tx`UPDATE leagues SET name = ${body.name} WHERE id = ${leagueId} AND creator_id = ${user.sub} RETURNING id`;
        const updated = await where;
        if (updated.length === 0) return [];
      }
      if (body.avatar_emoji !== undefined) {
        const where = isAdmin
          ? tx`UPDATE leagues SET avatar_emoji = ${body.avatar_emoji} WHERE id = ${leagueId} RETURNING id`
          : tx`UPDATE leagues SET avatar_emoji = ${body.avatar_emoji} WHERE id = ${leagueId} AND creator_id = ${user.sub} RETURNING id`;
        const updated = await where;
        if (updated.length === 0) return [];
      }
      return tx`SELECT * FROM leagues WHERE id = ${leagueId} LIMIT 1`;
    });

    if (rows.length === 0) {
      return c.json({ error: "League not found or not authorized" }, 404);
    }
    return c.json(rows[0]);
  },
);

export default router;
