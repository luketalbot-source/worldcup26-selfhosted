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

// Build a URL-safe tenant uid: "<slug>-<12 hex bytes>". The slug makes the
// admin-side URLs readable, the suffix keeps them unique even for duplicate
// names. Matches the existing format already in the DB ("flip-76bd82f1...").
function generateTenantUid(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32) || "tenant";
  const suffix = [...crypto.getRandomValues(new Uint8Array(12))]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `${slug}-${suffix}`;
}

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
    const uid = body.uid ?? generateTenantUid(body.name);
    const rows = await sql`
      INSERT INTO tenants (id, name, uid, created_at)
      VALUES (gen_random_uuid(), ${body.name}, ${uid}, NOW())
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

// OAuth/OIDC endpoint-path suffixes that people commonly paste when they
// mean "the issuer". We strip them in order and retry discovery at the
// parent path so Keycloak / Entra / Okta / Auth0 auth-endpoint URLs all
// resolve to the real issuer.
const ISSUER_PATH_SUFFIXES = [
  "/protocol/openid-connect/auth",     // Keycloak auth endpoint
  "/protocol/openid-connect/token",    // Keycloak token endpoint
  "/protocol/openid-connect/userinfo", // Keycloak userinfo
  "/protocol/openid-connect",          // Keycloak base
  "/oauth2/v2.0/authorize",            // Entra v2
  "/oauth2/v2.0/token",                // Entra v2
  "/oauth2/authorize",                 // Entra v1, generic OAuth
  "/oauth2/token",                     // generic OAuth
  "/oauth/authorize",                  // Auth0
  "/oauth/token",                      // Auth0
  "/v1/authorize",                     // Okta
  "/v1/token",                         // Okta
  "/authorize",                        // short form
];

function candidateIssuerUrls(input: string): string[] {
  const trimmed = input.trim().replace(/\/+$/, "");
  const set = new Set<string>();
  set.add(trimmed);
  for (const suffix of ISSUER_PATH_SUFFIXES) {
    if (trimmed.toLowerCase().endsWith(suffix)) {
      set.add(trimmed.slice(0, -suffix.length).replace(/\/+$/, ""));
    }
  }
  return [...set];
}

async function fetchOidcDiscovery(input: string): Promise<{ doc: OidcDiscoveryDoc; issuer: string }> {
  const candidates = candidateIssuerUrls(input);
  const failures: string[] = [];

  for (const base of candidates) {
    const url = `${base}/.well-known/openid-configuration`;
    try {
      const res = await fetch(url, { headers: { Accept: "application/json" } });
      if (!res.ok) {
        failures.push(`${res.status} at ${url}`);
        continue;
      }
      const doc = (await res.json()) as OidcDiscoveryDoc;
      // Prefer the issuer the IdP returns over what we guessed — it's the
      // canonical value and must match the 'iss' claim on id_tokens.
      return { doc, issuer: doc.issuer ?? base };
    } catch (err) {
      failures.push(`${(err as Error).message} at ${url}`);
    }
  }

  throw new Error(
    `OIDC discovery failed. Tried ${candidates.length} URL(s): ${failures.join("; ")}. ` +
    `Expected the issuer to serve /.well-known/openid-configuration.`
  );
}

router.patch("/:id/oidc-config", requireAdmin, zValidator("json", oidcConfigSchema), async (c) => {
  const tenantId = c.req.param("id");
  const body = c.req.valid("json");

  // Fill in the OIDC endpoints from the IdP's discovery document — unless the
  // admin supplied explicit overrides.
  let discovery: OidcDiscoveryDoc = {};
  let canonicalIssuer = body.issuer;
  try {
    const result = await fetchOidcDiscovery(body.issuer);
    discovery = result.doc;
    canonicalIssuer = result.issuer;
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
      ${body.client_secret ?? null}, ${canonicalIssuer},
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
           p.display_name, p.avatar_emoji,
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
