import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { sql } from "../db";
import { requireAdmin, type AuthEnv } from "../auth/middleware";

const router = new Hono<AuthEnv>();

router.get("/", requireAdmin, async (c) => {
  const rows = await sql`
    SELECT t.*, (SELECT COUNT(*) FROM oidc_identities oi WHERE oi.tenant_id = t.id) AS oidc_count
    FROM tenants t
    ORDER BY t.created_at DESC
  `;
  return c.json(rows);
});

router.post(
  "/",
  requireAdmin,
  zValidator(
    "json",
    z.object({
      name: z.string().min(1),
      uid: z.string().min(1).optional(),
    })
  ),
  async (c) => {
    const body = c.req.valid("json");
    const rows = await sql`
      INSERT INTO tenants (id, name, uid, created_at)
      VALUES (gen_random_uuid(), ${body.name}, ${body.uid ?? null}, NOW())
      RETURNING *
    `;
    return c.json(rows[0], 201);
  }
);

router.delete("/:id", requireAdmin, async (c) => {
  const id = c.req.param("id");
  await sql`DELETE FROM tenants WHERE id = ${id}`;
  return c.json({ ok: true });
});

router.get("/by-uid/:uid", async (c) => {
  const uid = c.req.param("uid");
  const rows = await sql`SELECT * FROM tenants WHERE uid = ${uid} LIMIT 1`;
  if (rows.length === 0) return c.json({ error: "Tenant not found" }, 404);
  return c.json(rows[0]);
});

router.get("/:id/oidc-config", async (c) => {
  const id = c.req.param("id");
  const rows = await sql`
    SELECT * FROM tenant_oidc_configs WHERE tenant_id = ${id} LIMIT 1
  `;
  if (rows.length === 0) return c.json({ error: "OIDC config not found" }, 404);
  // Don't expose client_secret
  const { client_secret: _omit, ...safe } = rows[0] as any;
  return c.json(safe);
});

const oidcConfigSchema = z.object({
  client_id: z.string(),
  client_secret: z.string().optional(),
  issuer: z.string().url(),
  authorization_endpoint: z.string().url(),
  token_endpoint: z.string().url(),
  userinfo_endpoint: z.string().url(),
  jwks_uri: z.string().url(),
  redirect_uri: z.string().url(),
  consent_required: z.boolean().optional(),
});

router.patch("/:id/oidc-config", requireAdmin, zValidator("json", oidcConfigSchema), async (c) => {
  const tenantId = c.req.param("id");
  const body = c.req.valid("json");

  const rows = await sql`
    INSERT INTO tenant_oidc_configs (
      id, tenant_id, client_id, client_secret, issuer,
      authorization_endpoint, token_endpoint, userinfo_endpoint,
      jwks_uri, redirect_uri, consent_required, updated_at
    )
    VALUES (
      gen_random_uuid(), ${tenantId}, ${body.client_id},
      ${body.client_secret ?? null}, ${body.issuer},
      ${body.authorization_endpoint}, ${body.token_endpoint},
      ${body.userinfo_endpoint}, ${body.jwks_uri}, ${body.redirect_uri},
      ${body.consent_required ?? false}, NOW()
    )
    ON CONFLICT (tenant_id) DO UPDATE
      SET client_id              = EXCLUDED.client_id,
          client_secret          = COALESCE(EXCLUDED.client_secret, tenant_oidc_configs.client_secret),
          issuer                 = EXCLUDED.issuer,
          authorization_endpoint = EXCLUDED.authorization_endpoint,
          token_endpoint         = EXCLUDED.token_endpoint,
          userinfo_endpoint      = EXCLUDED.userinfo_endpoint,
          jwks_uri               = EXCLUDED.jwks_uri,
          redirect_uri           = EXCLUDED.redirect_uri,
          consent_required       = EXCLUDED.consent_required,
          updated_at             = NOW()
    RETURNING *
  `;
  const { client_secret: _omit, ...safe } = rows[0] as any;
  return c.json(safe);
});

router.get("/:id/users", requireAdmin, async (c) => {
  const tenantId = c.req.param("id");
  const rows = await sql`
    SELECT u.id, u.email, u.phone, u.created_at,
           p.display_name, p.avatar_emoji, p.locale,
           oi.oidc_subject, oi.created_at AS identity_linked_at
    FROM oidc_identities oi
    INNER JOIN public.users u ON u.id = oi.user_id
    LEFT JOIN profiles p ON p.user_id = u.id
    WHERE oi.tenant_id = ${tenantId}
    ORDER BY u.created_at DESC
  `;
  return c.json(rows);
});

export default router;
