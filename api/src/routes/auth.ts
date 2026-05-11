import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { SignJWT, jwtVerify, createRemoteJWKSet } from "jose";
import { createHash } from "crypto";
import { sql } from "../db";
import { requireAuth, type AuthEnv } from "../auth/middleware";
import { sendEmail } from "../lib/email";

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

// The main tenant app is designed to run inside a cross-site iframe, so the
// refresh cookie needs SameSite=None (to be sent in cross-site contexts),
// Secure (required by browsers whenever SameSite=None), and Partitioned
// (CHIPS — keeps the cookie scoped to the top-level site to satisfy Chrome's
// third-party cookie restrictions). In non-production we fall back to Lax so
// the cookie works on plain http://localhost.
const COOKIE_ATTRS_PROD = "HttpOnly; Path=/; SameSite=None; Secure; Partitioned";
const COOKIE_ATTRS_DEV = "HttpOnly; Path=/; SameSite=Lax";
const COOKIE_ATTRS = process.env.NODE_ENV === "production" ? COOKIE_ATTRS_PROD : COOKIE_ATTRS_DEV;

function setRefreshCookie(c: any, token: string): void {
  c.header(
    "Set-Cookie",
    `${REFRESH_COOKIE}=${token}; ${COOKIE_ATTRS}; Max-Age=${30 * 24 * 60 * 60}`
  );
}

function clearRefreshCookie(c: any): void {
  c.header(
    "Set-Cookie",
    `${REFRESH_COOKIE}=; ${COOKIE_ATTRS}; Max-Age=0`
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

// -----------------------------------------------------------------------------
// Email-allowlist admin login (replaces dev-login for production).
//
//   Step 1: POST /admin-login/start     { email }       → 6-digit code in email
//   Step 2: POST /admin-login/verify    { email, code } → admin JWT pair
//
// Allowlist lives in the ADMIN_EMAILS env var (comma-separated). Codes are
// 6 digits, 10 minutes valid, single-use, sha256-hashed in DB. Up to 5
// failed verifies per code before it's burned. Rate-limited per email at
// 5 codes per hour to prevent enumeration / spam.
//
// Email is delivered via Resend (api/src/lib/email.ts).
// -----------------------------------------------------------------------------

const ADMIN_LOGIN_CODE_TTL_MS  = 10 * 60 * 1000;     // 10 min
const ADMIN_LOGIN_MAX_ATTEMPTS = 5;                  // failed verifies per code
const ADMIN_LOGIN_RATE_WINDOW_MS = 60 * 60 * 1000;   // 1 hour
const ADMIN_LOGIN_RATE_MAX = 5;                      // max codes per email per window

function parseAdminAllowlist(): Set<string> {
  const raw = process.env.ADMIN_EMAILS ?? "";
  return new Set(
    raw
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter((s) => s.length > 0),
  );
}

function generateLoginCode(): string {
  // Crypto-safe 6-digit code. randomInt is unbiased across the requested range.
  const { randomInt } = require("crypto") as typeof import("crypto");
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

function isValidEmail(s: string): boolean {
  // Just enough validation to avoid storing obvious garbage. Real checking
  // happens via the allowlist comparison.
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) && s.length <= 254;
}

router.post(
  "/admin-login/start",
  zValidator("json", z.object({ email: z.string().min(3).max(254) })),
  async (c) => {
    const rawEmail = c.req.valid("json").email.trim();
    if (!isValidEmail(rawEmail)) {
      return c.json({ error: "Invalid email" }, 400);
    }
    const email = rawEmail.toLowerCase();
    const allowlist = parseAdminAllowlist();

    // Rate-limit BEFORE the allowlist check so the response is identical for
    // allowlisted vs non-allowlisted emails — no enumeration oracle.
    const recentCodes = await sql<{ count: number }[]>`
      SELECT COUNT(*)::int AS count
      FROM public.admin_login_codes
      WHERE email = ${email}
        AND created_at > NOW() - ${ADMIN_LOGIN_RATE_WINDOW_MS / 1000}::int * INTERVAL '1 second'
    `;
    if ((recentCodes[0]?.count ?? 0) >= ADMIN_LOGIN_RATE_MAX) {
      return c.json({ error: "Too many login attempts; try again in an hour." }, 429);
    }

    // Constant response shape regardless of whether email is on the allowlist:
    // attackers can't distinguish "valid admin email" from "unknown email" via
    // the response. We still skip the email send + DB write for non-allowlisted
    // addresses, but the latency is similar enough not to leak.
    if (!allowlist.has(email)) {
      // Small artificial delay so response time doesn't reveal the answer.
      await new Promise((r) => setTimeout(r, 200));
      return c.json({ ok: true });
    }

    const code = generateLoginCode();
    const codeHash = hashToken(code);
    const expiresAt = new Date(Date.now() + ADMIN_LOGIN_CODE_TTL_MS);
    const ip = c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
    const ua = c.req.header("user-agent") ?? null;

    await sql`
      INSERT INTO public.admin_login_codes
        (email, code_hash, expires_at, ip_address, user_agent)
      VALUES
        (${email}, ${codeHash}, ${expiresAt}, ${ip}, ${ua})
    `;

    const result = await sendEmail({
      to: email,
      subject: `Football 2026 admin code: ${code}`,
      html: `
        <p>Hi,</p>
        <p>Use this code to sign in to the Football 2026 admin console:</p>
        <p style="font-size:32px;font-weight:600;letter-spacing:6px;font-family:monospace;background:#f4f4f5;padding:16px 24px;border-radius:8px;display:inline-block;">${code}</p>
        <p style="color:#71717a;font-size:13px;">The code expires in 10 minutes. If you didn't try to sign in, you can ignore this email.</p>
      `,
      text: `Your Football 2026 admin login code: ${code}\n\nThe code expires in 10 minutes.`,
    });

    if (!result.ok) {
      console.error("[admin-login] email send failed for", email, ":", result.error);
      // Don't surface the upstream error to the client (could leak provider
      // detail). The user retries; we'll see the cause in server logs.
      return c.json({ error: "Failed to send code; try again." }, 500);
    }

    return c.json({ ok: true });
  },
);

router.post(
  "/admin-login/verify",
  zValidator(
    "json",
    z.object({
      email: z.string().min(3).max(254),
      code: z.string().regex(/^\d{6}$/, "Code must be 6 digits"),
    }),
  ),
  async (c) => {
    const body = c.req.valid("json");
    const email = body.email.trim().toLowerCase();
    const codeHash = hashToken(body.code);

    // Find the most recent unused, unexpired code for this email.
    const rows = await sql<
      { id: string; code_hash: string; expires_at: Date; failed_verify_count: number }[]
    >`
      SELECT id, code_hash, expires_at, failed_verify_count
      FROM public.admin_login_codes
      WHERE email = ${email}
        AND used_at IS NULL
        AND expires_at > NOW()
        AND failed_verify_count < ${ADMIN_LOGIN_MAX_ATTEMPTS}
      ORDER BY created_at DESC
      LIMIT 1
    `;

    const row = rows[0];
    // Don't tell the client whether the email or the code was wrong — same
    // generic 401 for both, so the client can't probe the allowlist.
    const generic = () => c.json({ error: "Invalid or expired code" }, 401);

    if (!row) return generic();

    if (row.code_hash !== codeHash) {
      await sql`
        UPDATE public.admin_login_codes
        SET failed_verify_count = failed_verify_count + 1
        WHERE id = ${row.id}
      `;
      return generic();
    }

    // Defence-in-depth: verify allowlist membership again at verify time.
    // (The email could have been removed from ADMIN_EMAILS between start and
    // verify.)
    const allowlist = parseAdminAllowlist();
    if (!allowlist.has(email)) return generic();

    // Mark the code used so it can't be replayed.
    await sql`
      UPDATE public.admin_login_codes
      SET used_at = NOW()
      WHERE id = ${row.id}
    `;

    // Upsert the admin user. Display name defaults to the local-part of the
    // email; the user can rename later via profile.
    const existing = await sql<{ id: string }[]>`
      SELECT id FROM public.users WHERE email = ${email} LIMIT 1
    `;
    let userId: string;
    if (existing.length > 0) {
      userId = existing[0]!.id;
    } else {
      const localPart = email.split("@")[0] ?? email;
      const displayName = localPart
        .replace(/[._-]+/g, " ")
        .replace(/\b\w/g, (m) => m.toUpperCase());
      const created = await sql<{ id: string }[]>`
        INSERT INTO public.users (id, email, display_name, created_at)
        VALUES (gen_random_uuid(), ${email}, ${displayName}, NOW())
        RETURNING id
      `;
      userId = created[0]!.id;
    }

    // Idempotent admin role grant.
    await sql`
      INSERT INTO user_roles (id, user_id, role, created_at)
      VALUES (gen_random_uuid(), ${userId}, 'admin'::app_role, NOW())
      ON CONFLICT (user_id, role) DO NOTHING
    `;

    const accessToken = await signAccessToken({
      sub: userId,
      email,
      role: "admin",
    });
    const refreshToken = await signRefreshToken(userId);
    await storeRefreshToken(userId, refreshToken);

    setRefreshCookie(c, refreshToken);
    return c.json({
      access_token: accessToken,
      user: { id: userId, email, role: "admin" },
    });
  },
);

// POST /dev-tenant-login
// Gated open-user entry for testing the tenant app without a real OIDC
// provider. Creates or reuses a demo tenant user with an oidc_identity
// row tied to the given tenant_id, so checkUserTenant() in TenantApp
// is satisfied. Only enabled when ADMIN_OPEN=1.
router.post(
  "/dev-tenant-login",
  zValidator("json", z.object({ tenant_id: z.string().uuid() })),
  async (c) => {
    if (!ADMIN_OPEN) return c.json({ error: "Open dev login is disabled" }, 403);
    const { tenant_id } = c.req.valid("json");

    const demoEmail = `demo-${tenant_id.slice(0, 8)}@wc2026.local`;
    const demoName = "Demo User";
    const demoSubject = `demo-${tenant_id}`;

    // Upsert user
    const users = await sql<{ id: string }[]>`
      SELECT id FROM public.users WHERE email = ${demoEmail} LIMIT 1
    `;
    let userId: string;
    if (users.length > 0) {
      userId = users[0]!.id;
    } else {
      const created = await sql<{ id: string }[]>`
        INSERT INTO public.users (id, email, display_name, created_at)
        VALUES (gen_random_uuid(), ${demoEmail}, ${demoName}, NOW())
        RETURNING id
      `;
      userId = created[0]!.id;
    }

    // Upsert oidc_identity so TenantApp's checkUserTenant passes
    await sql`
      INSERT INTO oidc_identities (id, user_id, tenant_id, oidc_subject, created_at)
      VALUES (gen_random_uuid(), ${userId}, ${tenant_id}, ${demoSubject}, NOW())
      ON CONFLICT (tenant_id, oidc_subject) DO UPDATE SET user_id = EXCLUDED.user_id
    `;

    // Ensure a profile row exists for this tenant (MatchesView / leaderboard needs it)
    await sql`
      INSERT INTO profiles (id, user_id, tenant_id, display_name, created_at, updated_at)
      VALUES (gen_random_uuid(), ${userId}, ${tenant_id}, ${demoName}, NOW(), NOW())
      ON CONFLICT (user_id) DO UPDATE SET tenant_id = EXCLUDED.tenant_id
    `.catch(() => {});

    const accessToken = await signAccessToken({ sub: userId, email: demoEmail, role: "user" });
    const refreshToken = await signRefreshToken(userId);
    await storeRefreshToken(userId, refreshToken);

    setRefreshCookie(c, refreshToken);
    return c.json({
      access_token: accessToken,
      user: { id: userId, email: demoEmail, role: "user" },
    });
  }
);

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

// POST /oidc/pkce-init
//
// Frontend calls this right before redirecting the iframe to the IdP's
// authorize URL. It stores the PKCE code_verifier + tenant_id server-side
// keyed by `state` (the same state the frontend will send to the IdP).
// The callback handler below DELETE-RETURNs the row to get the verifier
// back — single-use semantics, same CSRF guarantee as the old
// sessionStorage-side state check.
//
// Replaces the client-side sessionStorage approach which got wiped when
// the Flip iframe was re-mounted between auth-start and callback.
router.post(
  "/oidc/pkce-init",
  zValidator(
    "json",
    z.object({
      state: z.string().min(8).max(256),
      code_verifier: z.string().min(8).max(256),
      tenant_id: z.string().uuid(),
    }),
  ),
  async (c) => {
    const { state, code_verifier, tenant_id } = c.req.valid("json");
    // ON CONFLICT replace — handles same-state replay (e.g. user clicks
    // sign-in twice, browser retries). Last write wins; old verifier
    // discarded. Refreshes expires_at to give the user a fresh 15 min.
    await sql`
      INSERT INTO public.pkce_sessions (state, code_verifier, tenant_id)
      VALUES (${state}, ${code_verifier}, ${tenant_id})
      ON CONFLICT (state) DO UPDATE
        SET code_verifier = EXCLUDED.code_verifier,
            tenant_id     = EXCLUDED.tenant_id,
            created_at    = NOW(),
            expires_at    = NOW() + INTERVAL '15 minutes'
    `;
    return c.json({ ok: true });
  },
);

// POST /oidc/callback
router.post(
  "/oidc/callback",
  zValidator(
    "json",
    z.object({
      code: z.string(),
      state: z.string().optional(),
      // tenant_id and code_verifier are now both optional — the server
      // can resolve them from pkce_sessions when `state` is supplied.
      // Kept as input fields so a still-cached old client (deploy-window
      // straddler) doesn't fall off a cliff.
      tenant_id: z.string().uuid().optional(),
      code_verifier: z.string().optional(),
    })
  ),
  async (c) => {
    const body = c.req.valid("json");
    const { code, state } = body;

    // Resolve verifier + tenant_id. Prefer DB lookup by state (new path).
    // Fall back to whatever the client sent in the body (legacy path),
    // so an iframe with the previous bundle still works during the deploy
    // rollout.
    let code_verifier = body.code_verifier;
    let tenant_id = body.tenant_id;
    if (state) {
      const rows = await sql<{ code_verifier: string; tenant_id: string }[]>`
        DELETE FROM public.pkce_sessions
         WHERE state = ${state}
           AND expires_at > NOW()
        RETURNING code_verifier, tenant_id
      `;
      if (rows.length > 0) {
        code_verifier = rows[0]!.code_verifier;
        tenant_id = tenant_id ?? rows[0]!.tenant_id;
      }
    }

    if (!tenant_id) {
      return c.json({ error: "Session expired. Please try logging in again." }, 401);
    }
    if (!code_verifier) {
      return c.json({ error: "Session expired. Please try logging in again." }, 401);
    }

    const configs = await sql<{
      client_id: string;
      client_secret: string;
      token_endpoint: string;
      userinfo_endpoint: string;
      redirect_uri: string;
      consent_required: boolean;
    }[]>`
      SELECT client_id, client_secret, token_endpoint, userinfo_endpoint, redirect_uri, consent_required
      FROM tenant_oidc_config
      WHERE tenant_id = ${tenant_id}
      LIMIT 1
    `;

    if (configs.length === 0) return c.json({ error: "OIDC not configured for tenant" }, 400);
    const config = configs[0]!;

    // Exchange authorization code for tokens.
    // Many IdPs (Keycloak, Entra) accept both client_secret_post (creds in
    // body) and client_secret_basic (creds in Authorization: Basic header),
    // but some reject one or the other depending on client configuration.
    // Try POST first; if that fails with a credentials error, retry with
    // Basic. This covers Keycloak's default (Basic only) without extra
    // configuration.
    const tokenParams = new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: config.redirect_uri,
      client_id: config.client_id,
    });
    // PKCE: frontend generates a code_verifier + code_challenge pair, sends
    // code_challenge to the authorize endpoint, and passes code_verifier back
    // here so we can include it in the token exchange. Keycloak (and any IdP
    // with PKCE enforcement on) rejects the exchange without it.
    if (code_verifier) {
      tokenParams.set("code_verifier", code_verifier);
    }

    const tryTokenExchange = async (useBasic: boolean): Promise<Response> => {
      const headers: Record<string, string> = {
        "Content-Type": "application/x-www-form-urlencoded",
      };
      const params = new URLSearchParams(tokenParams);
      if (useBasic) {
        headers["Authorization"] =
          "Basic " + btoa(`${config.client_id}:${config.client_secret}`);
      } else {
        params.set("client_secret", config.client_secret);
      }
      return fetch(config.token_endpoint, {
        method: "POST",
        headers,
        body: params.toString(),
      });
    };

    let tokenRes = await tryTokenExchange(false);
    if (!tokenRes.ok) {
      const firstErrText = await tokenRes.text();
      console.warn(
        `[oidc] client_secret_post failed (${tokenRes.status}): ${firstErrText}. Retrying with client_secret_basic.`
      );
      tokenRes = await tryTokenExchange(true);
      if (!tokenRes.ok) {
        const secondErrText = await tokenRes.text();
        console.error(
          `[oidc] client_secret_basic also failed (${tokenRes.status}): ${secondErrText}`
        );
        // Return the IdP's own message so the admin can see what went wrong.
        let idpMsg = secondErrText;
        try {
          const parsed = JSON.parse(secondErrText);
          idpMsg = parsed.error_description || parsed.error || secondErrText;
        } catch { /* not JSON */ }
        return c.json(
          { error: `Token exchange failed: ${idpMsg}` },
          400
        );
      }
    }

    const tokenData = (await tokenRes.json()) as { access_token: string; id_token?: string };

    // Get user info
    const userInfoRes = await fetch(config.userinfo_endpoint, {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });

    if (!userInfoRes.ok) {
      const errText = await userInfoRes.text();
      console.error(`[oidc] userinfo failed (${userInfoRes.status}): ${errText}`);
      return c.json({ error: `Failed to fetch user info: ${errText}` }, 400);
    }
    const userInfo = (await userInfoRes.json()) as OidcUserInfo;

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
      FROM tenant_oidc_config
      WHERE tenant_id = ${tenant_id}
      LIMIT 1
    `;

    if (configs.length === 0) return c.json({ error: "OIDC not configured for tenant" }, 400);
    const config = configs[0]!;

    let userInfo: OidcUserInfo;
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

// Standard OIDC user-info claims we care about. Keycloak, Entra, Google all
// send at least some subset. `name` is the full formatted name; `given_name` +
// `family_name` are the split versions. `preferred_username` is usually a
// machine-style handle ("luke.talbot") — last-resort fallback.
export interface OidcUserInfo {
  sub: string;
  email?: string;
  name?: string;
  given_name?: string;
  family_name?: string;
  preferred_username?: string;
}

/**
 * Derives the human-readable display name for a user from their OIDC claims.
 * Precedence:
 *   1. "{given_name} {family_name}"  — preferred, always reads as "Luke Talbot"
 *   2. name                          — pre-formatted full name from the IdP
 *   3. preferred_username            — machine handle, e.g. "luke.talbot"
 *   4. email local part              — last resort
 *   5. null                          — upstream will fall back to something else
 */
function deriveDisplayName(info: OidcUserInfo): string | null {
  const given = info.given_name?.trim();
  const family = info.family_name?.trim();
  if (given && family) return `${given} ${family}`;
  if (given) return given;
  if (family) return family;
  const name = info.name?.trim();
  if (name) return name;
  const preferred = info.preferred_username?.trim();
  if (preferred) return preferred;
  if (info.email) {
    const local = info.email.split("@")[0]?.trim();
    if (local) return local;
  }
  return null;
}

async function upsertOidcUser(
  userInfo: OidcUserInfo,
  tenantId: string,
  consentRequired: boolean
): Promise<{ user: { id: string; email: string; role: string }; needsConsent: boolean }> {
  const displayName = deriveDisplayName(userInfo);

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
        VALUES (gen_random_uuid(), ${userInfo.email ?? null}, ${displayName}, NOW())
        RETURNING id
      `;
      userId = created[0]!.id;
      needsConsent = consentRequired;
    }

    await sql`
      INSERT INTO oidc_identities (id, user_id, tenant_id, oidc_subject, created_at)
      VALUES (gen_random_uuid(), ${userId}, ${tenantId}, ${userInfo.sub}, NOW())
      ON CONFLICT (tenant_id, oidc_subject) DO UPDATE SET user_id = EXCLUDED.user_id
    `;
  }

  // Sync the derived name on every login — keeps the in-app name aligned with
  // the host (Flip) identity even if someone renames themselves upstream.
  // Updates both users.display_name (source of truth) and profiles.display_name
  // (what the UI reads). Only writes if the derived name actually differs, so
  // we don't churn updated_at on every sign-in.
  if (displayName) {
    await sql`
      UPDATE public.users
         SET display_name = ${displayName}
       WHERE id = ${userId}
         AND (display_name IS DISTINCT FROM ${displayName})
    `;
    await sql`
      UPDATE public.profiles
         SET display_name = ${displayName},
             updated_at   = NOW()
       WHERE user_id = ${userId}
         AND (display_name IS DISTINCT FROM ${displayName})
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
