import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { SignJWT, jwtVerify, createRemoteJWKSet } from "jose";
import { createHash } from "crypto";
import { sql } from "../db";
import { requireAuth, type AuthEnv } from "../auth/middleware";

const router = new Hono<AuthEnv>();

const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET ?? "dev-secret-change-me");
const JWT_REFRESH_SECRET = new TextEncoder().encode(
  process.env.JWT_REFRESH_SECRET ?? process.env.JWT_SECRET ?? "dev-secret-change-me"
);

const REFRESH_COOKIE = "wc26_refresh";
const ADMIN_OPEN = process.env.ADMIN_OPEN === "1";
const DEV_ADMIN_EMAIL = "admin@wc2026.local";

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

async function signAccessToken(payload: { sub: string; email: string; role: string }): Promise<string> {
  return new SignJWT({ email: payload.email, role: payload.role })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(payload.sub)
    .setIssuedAt()
    .setExpirationTime("15m")
    .sign(JWT_SECRET);
}

async function signRefreshToken(userId: string): Promise<string> {
  return new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(JWT_REFRESH_SECRET);
}

async function storeRefreshToken(userId: string, token: string): Promise<void> {
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  await sql`
    INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at, created_at)
    VALUES (gen_random_uuid(), ${userId}, ${tokenHash}, ${expiresAt}, NOW())
  `;
}

function setRefreshCookie(c: any, token: string): void {
  c.header(
    "Set-Cookie",
    `${REFRESH_COOKIE}=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${30 * 24 * 60 * 60}${process.env.NODE_ENV === "production" ? "; Secure" : ""}`
  );
}

function clearRefreshCookie(c: any): void {
  c.header(
    "Set-Cookie",
    `${REFRESH_COOKIE}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0${process.env.NODE_ENV === "production" ? "; Secure" : ""}`
  );
}

function getCookieValue(cookieHeader: string | undefined, name: string): string | null {
  if (!cookieHeader) return null;
  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]!) : null;
}

// POST /dev-login
// Gated open-admin entry for solo development. Ensures a singleton dev admin
// user exists with role='admin', then issues a normal JWT pair. Only enabled
// when ADMIN_OPEN=1 is set on the API service — disabled in prod by default.
router.post("/dev-login", async (c) => {
  if (!ADMIN_OPEN) return c.json({ error: "Open admin login is disabled" }, 403);

  // Upsert the dev admin user (view-writes fall through to auth.users).
  const users = await sql<{ id: string }[]>`
    SELECT id FROM public.users WHERE email = ${DEV_ADMIN_EMAIL} LIMIT 1
  `;

  let userId: string;
  if (users.length > 0) {
    userId = users[0]!.id;
  } else {
    const created = await sql<{ id: string }[]>`
      INSERT INTO public.users (id, email, display_name, created_at)
      VALUES (gen_random_uuid(), ${DEV_ADMIN_EMAIL}, 'Dev Admin', NOW())
      RETURNING id
    `;
    userId = created[0]!.id;
  }

  // Ensure admin role is granted (idempotent).
  await sql`
    INSERT INTO user_roles (id, user_id, role, created_at)
    VALUES (gen_random_uuid(), ${userId}, 'admin'::app_role, NOW())
    ON CONFLICT (user_id, role) DO NOTHING
  `;

  const accessToken = await signAccessToken({
    sub: userId,
    email: DEV_ADMIN_EMAIL,
    role: "admin",
  });
  const refreshToken = await signRefreshToken(userId);
  await storeRefreshToken(userId, refreshToken);

  setRefreshCookie(c, refreshToken);
  return c.json({ access_token: accessToken, user: { id: userId, email: DEV_ADMIN_EMAIL, role: "admin" } });
});

// POST /refresh
router.post("/refresh", async (c) => {
  const cookieHeader = c.req.header("Cookie");
  const token = getCookieValue(cookieHeader, REFRESH_COOKIE);
  if (!token) return c.json({ error: "No refresh token" }, 401);

  let payload: any;
  try {
    const result = await jwtVerify(token, JWT_REFRESH_SECRET);
    payload = result.payload;
  } catch {
    clearRefreshCookie(c);
    return c.json({ error: "Invalid refresh token" }, 401);
  }

  const userId = payload.sub as string;
  const tokenHash = hashToken(token);

  const rows = await sql<{ id: string }[]>`
    SELECT id FROM refresh_tokens
    WHERE user_id = ${userId} AND token_hash = ${tokenHash} AND expires_at > NOW()
    LIMIT 1
  `;

  if (rows.length === 0) {
    clearRefreshCookie(c);
    return c.json({ error: "Refresh token not found or expired" }, 401);
  }

  // Rotate token
  await sql`DELETE FROM refresh_tokens WHERE id = ${rows[0]!.id}`;

  const users = await sql<{ id: string; email: string; role: string }[]>`
    SELECT u.id, COALESCE(u.email, '') AS email, COALESCE(ur.role::text, 'user') AS role
    FROM public.users u
    LEFT JOIN user_roles ur ON ur.user_id = u.id
    WHERE u.id = ${userId}
    LIMIT 1
  `;

  if (users.length === 0) {
    clearRefreshCookie(c);
    return c.json({ error: "User not found" }, 401);
  }

  const user = users[0]!;
  const newAccessToken = await signAccessToken({ sub: user.id, email: user.email, role: user.role });
  const newRefreshToken = await signRefreshToken(user.id);
  await storeRefreshToken(user.id, newRefreshToken);

  setRefreshCookie(c, newRefreshToken);
  return c.json({ access_token: newAccessToken });
});

// POST /signout
router.post("/signout", async (c) => {
  const cookieHeader = c.req.header("Cookie");
  const token = getCookieValue(cookieHeader, REFRESH_COOKIE);
  if (token) {
    const tokenHash = hashToken(token);
    await sql`DELETE FROM refresh_tokens WHERE token_hash = ${tokenHash}`.catch(() => {});
  }
  clearRefreshCookie(c);
  return c.json({ ok: true });
});

// POST /oidc/callback
router.post(
  "/oidc/callback",
  zValidator("json", z.object({ code: z.string(), state: z.string().optional(), tenant_id: z.string().uuid() })),
  async (c) => {
    const { code, tenant_id } = c.req.valid("json");

    const configs = await sql<{
      client_id: string;
      client_secret: string;
      token_endpoint: string;
      userinfo_endpoint: string;
      redirect_uri: string;
      consent_required: boolean;
    }[]>`
      SELECT client_id, client_secret, token_endpoint, userinfo_endpoint, redirect_uri, consent_required
      FROM tenant_oidc_configs
      WHERE tenant_id = ${tenant_id}
      LIMIT 1
    `;

    if (configs.length === 0) return c.json({ error: "OIDC not configured for tenant" }, 400);
    const config = configs[0]!;

    // Exchange code for tokens
    const tokenRes = await fetch(config.token_endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: config.redirect_uri,
        client_id: config.client_id,
        client_secret: config.client_secret,
      }).toString(),
    });

    if (!tokenRes.ok) return c.json({ error: "Token exchange failed" }, 400);
    const tokenData = await tokenRes.json() as { access_token: string; id_token?: string };

    // Get user info
    const userInfoRes = await fetch(config.userinfo_endpoint, {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });

    if (!userInfoRes.ok) return c.json({ error: "Failed to fetch user info" }, 400);
    const userInfo = await userInfoRes.json() as { sub: string; email?: string; name?: string };

    const { user, needsConsent } = await upsertOidcUser(userInfo, tenant_id, config.consent_required ?? false);

    const accessToken = await signAccessToken({ sub: user.id, email: user.email, role: user.role });
    const refreshToken = await signRefreshToken(user.id);
    await storeRefreshToken(user.id, refreshToken);
    setRefreshCookie(c, refreshToken);

    return c.json({ access_token: accessToken, needsConsent });
  }
);

// POST /oidc/token-auth
router.post(
  "/oidc/token-auth",
  zValidator("json", z.object({ id_token: z.string(), tenant_id: z.string().uuid() })),
  async (c) => {
    const { id_token, tenant_id } = c.req.valid("json");

    const configs = await sql<{
      jwks_uri: string;
      client_id: string;
      issuer: string;
      consent_required: boolean;
    }[]>`
      SELECT jwks_uri, client_id, issuer, consent_required
      FROM tenant_oidc_configs
      WHERE tenant_id = ${tenant_id}
      LIMIT 1
    `;

    if (configs.length === 0) return c.json({ error: "OIDC not configured for tenant" }, 400);
    const config = configs[0]!;

    let userInfo: { sub: string; email?: string; name?: string };
    try {
      const JWKS = createRemoteJWKSet(new URL(config.jwks_uri));
      const { payload } = await jwtVerify(id_token, JWKS, {
        issuer: config.issuer,
        audience: config.client_id,
      });
      userInfo = payload as any;
    } catch {
      return c.json({ error: "Invalid id_token" }, 401);
    }

    const { user } = await upsertOidcUser(userInfo, tenant_id, config.consent_required ?? false);

    const accessToken = await signAccessToken({ sub: user.id, email: user.email, role: user.role });
    const refreshToken = await signRefreshToken(user.id);
    await storeRefreshToken(user.id, refreshToken);
    setRefreshCookie(c, refreshToken);

    return c.json({ access_token: accessToken });
  }
);

async function upsertOidcUser(
  userInfo: { sub: string; email?: string; name?: string },
  tenantId: string,
  consentRequired: boolean
): Promise<{ user: { id: string; email: string; role: string }; needsConsent: boolean }> {
  // Check if oidc_identity already exists
  const existing = await sql<{ user_id: string }[]>`
    SELECT user_id FROM oidc_identities
    WHERE oidc_subject = ${userInfo.sub} AND tenant_id = ${tenantId}
    LIMIT 1
  `;

  let userId: string;
  let needsConsent = false;

  if (existing.length > 0) {
    userId = existing[0]!.user_id;
  } else {
    // Try to match by email
    let userRows: { id: string }[] = [];
    if (userInfo.email) {
      userRows = await sql<{ id: string }[]>`
        SELECT id FROM public.users WHERE email = ${userInfo.email} LIMIT 1
      `;
    }

    if (userRows.length > 0) {
      userId = userRows[0]!.id;
    } else {
      const created = await sql<{ id: string }[]>`
        INSERT INTO public.users (id, email, display_name, created_at)
        VALUES (gen_random_uuid(), ${userInfo.email ?? null}, ${userInfo.name ?? null}, NOW())
        RETURNING id
      `;
      userId = created[0]!.id;
      needsConsent = consentRequired;
    }

    await sql`
      INSERT INTO oidc_identities (id, user_id, tenant_id, oidc_subject, created_at)
      VALUES (gen_random_uuid(), ${userId}, ${tenantId}, ${userInfo.sub}, NOW())
      ON CONFLICT (user_id, tenant_id) DO UPDATE SET oidc_subject = EXCLUDED.oidc_subject
    `;
  }

  const users = await sql<{ id: string; email: string; role: string }[]>`
    SELECT u.id, COALESCE(u.email, '') AS email, COALESCE(ur.role::text, 'user') AS role
    FROM public.users u
    LEFT JOIN user_roles ur ON ur.user_id = u.id
    WHERE u.id = ${userId}
    LIMIT 1
  `;

  return { user: users[0]!, needsConsent };
}

// GET /identity
router.get("/identity", requireAuth, async (c) => {
  const user = c.get("user");
  const tenantId = c.req.query("tenant_id");
  if (!tenantId) return c.json({ error: "tenant_id is required" }, 400);

  const rows = await sql<{ oidc_subject: string }[]>`
    SELECT oidc_subject FROM oidc_identities
    WHERE user_id = ${user.sub} AND tenant_id = ${tenantId}
    LIMIT 1
  `;

  return c.json({
    has_identity: rows.length > 0,
    oidc_subject: rows[0]?.oidc_subject ?? null,
  });
});

export default router;
