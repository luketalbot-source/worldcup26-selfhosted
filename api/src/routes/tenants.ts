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
    SELECT * FROM tenant_oidc_config WHERE tenant_id = ${id} LIMIT 1
  `;
  if (rows.length === 0) return c.json({ error: "OIDC config not found" }, 404);
  // Don't expose client_secret — but do expose whether one is stored so the
  // admin UI can show "••••••" and treat an empty input as "leave unchanged".
  const row = rows[0] as any;
  const { client_secret, ...safe } = row;
  return c.json({ ...safe, has_client_secret: !!client_secret });
});

// Admin-facing schema: we only require the fields a human can realistically
// know off-hand. The endpoints are fetched from the IdP's discovery document.
const oidcConfigSchema = z.object({
  issuer: z.string().url(),
  client_id: z.string().min(1),
  client_secret: z.string().optional(),
  redirect_uri: z.string().url(),
  consent_required: z.boolean().optional(),
  // Optional manual overrides for IdPs that don't publish discovery correctly.
  authorization_endpoint: z.string().url().optional(),
  token_endpoint: z.string().url().optional(),
  userinfo_endpoint: z.string().url().optional(),
  jwks_uri: z.string().url().optional(),
});

interface OidcDiscoveryDoc {
  authorization_endpoint?: string;
  token_endpoint?: string;
  userinfo_endpoint?: string;
  jwks_uri?: string;
  issuer?: string;
}

async function fetchOidcDiscovery(issuer: string): Promise<OidcDiscoveryDoc> {
  // Normalise: strip trailing slash, append well-known path.
  const base = issuer.replace(/\/+$/, "");
  const url = `${base}/.well-known/openid-configuration`;
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) {
    throw new Error(`OIDC discovery failed: ${res.status} ${res.statusText} at ${url}`);
  }
  return (await res.json()) as OidcDiscoveryDoc;
}

router.patch("/:id/oidc-config", requireAdmin, zValidator("json", oidcConfigSchema), async (c) => {
  const tenantId = c.req.param("id");
  const body = c.req.valid("json");

  // Fill in the OIDC endpoints from the IdP's discovery document — unless the
  // admin supplied explicit overrides.
  let discovery: OidcDiscoveryDoc = {};
  try {
    discovery = await fetchOidcDiscovery(body.issuer);
  } catch (err) {
    // If discovery fails but the admin provided all four endpoints manually,
    // that's fine — we'll fall back to those below. Otherwise, 400.
    const hasAllManual =
      body.authorization_endpoint &&
      body.token_endpoint &&
      body.userinfo_endpoint &&
      body.jwks_uri;
    if (!hasAllManual) {
      return c.json(
        { error: `Could not load OIDC discovery document: ${(err as Error).message}` },
        400
      );
    }
  }

  const authorizationEndpoint = body.authorization_endpoint ?? discovery.authorization_endpoint;
  const tokenEndpoint = body.token_endpoint ?? discovery.token_endpoint;
  const userinfoEndpoint = body.userinfo_endpoint ?? discovery.userinfo_endpoint;
  const jwksUri = body.jwks_uri ?? discovery.jwks_uri;

  if (!authorizationEndpoint || !tokenEndpoint || !userinfoEndpoint || !jwksUri) {
    return c.json(
      { error: "OIDC discovery was incomplete and no manual endpoints were provided" },
      400
    );
  }

  const rows = await sql`
    INSERT INTO tenant_oidc_config (
      id, tenant_id, client_id, client_secret, issuer,
      authorization_endpoint, token_endpoint, userinfo_endpoint,
      jwks_uri, redirect_uri, consent_required, updated_at
    )
    VALUES (
      gen_random_uuid(), ${tenantId}, ${body.client_id},
      ${body.client_secret ?? null}, ${body.issuer},
      ${authorizationEndpoint}, ${tokenEndpoint},
      ${userinfoEndpoint}, ${jwksUri}, ${body.redirect_uri},
      ${body.consent_required ?? false}, NOW()
    )
    ON CONFLICT (tenant_id) DO UPDATE
      SET client_id              = EXCLUDED.client_id,
          -- Empty-string client_secret means "leave unchanged"; null means "clear"
          client_secret          = CASE
                                     WHEN EXCLUDED.client_secret IS NULL THEN tenant_oidc_config.client_secret
                                     WHEN EXCLUDED.client_secret = '' THEN tenant_oidc_config.client_secret
                                     ELSE EXCLUDED.client_secret
                                   END,
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
  const row = rows[0] as any;
  const { client_secret, ...safe } = row;
  return c.json({ ...safe, has_client_secret: !!client_secret });
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
