import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { sql } from "../db";
import { requireAdmin, type AuthEnv } from "../auth/middleware";
import { buildResultsCsv } from "../lib/resultsExport";
import { buildLeaguesCsv } from "../lib/leaguesExport";

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
    // New tenants start with active competitions enabled — a tenant with
    // zero enabled competitions renders an empty app, and "created it, now
    // it works" is the right default. Archives stay off (the new tenant
    // never played them); admins can still toggle everything afterwards.
    // Two guards:
    //   - fixtures must exist: an active-but-feedless game (Europa League
    //     teaser, Champions League before its draw syncs) would render as a
    //     playable card with zero matches;
    //   - EMBARGO INHERITANCE: if a platform-wide scheduled go-live is
    //     pending for a competition (future enabled_at rows on other
    //     tenants), the new tenant inherits the earliest pending moment
    //     instead of jumping the gun with an immediate enablement.
    const tenantId = (rows[0] as { id: string }).id;
    await sql`
      INSERT INTO public.tenant_competitions (tenant_id, competition_id, enabled_at)
      SELECT ${tenantId}, c.id,
             GREATEST(
               now(),
               COALESCE(
                 (SELECT MIN(tc2.enabled_at) FROM public.tenant_competitions tc2
                   WHERE tc2.competition_id = c.id AND tc2.enabled_at > now()),
                 now()
               )
             )
        FROM public.competitions c
       WHERE c.is_active
         AND EXISTS (SELECT 1 FROM public.live_matches lm WHERE lm.competition_id = c.id)
      ON CONFLICT (tenant_id, competition_id) DO NOTHING
    `;
    return c.json(rows[0], 201);
  }
);

router.delete("/:id", requireAdmin, async (c) => {
  const id = c.req.param("id");
  await sql`DELETE FROM tenants WHERE id = ${id}`;
  return c.json({ ok: true });
});

// Tenant settings update. Admin-only. Any future tenant-scoped toggle
// (theming, feature flags, etc.) belongs here too.
router.patch(
  "/:id",
  requireAdmin,
  zValidator(
    "json",
    z.object({
      name: z.string().min(1).max(120).optional(),
      allow_custom_leagues: z.boolean().optional(),
      // False = hide "coming soon" teaser competitions from this tenant's
      // users entirely; they see only the games enabled for them.
      show_teaser_competitions: z.boolean().optional(),
      // Free-form Terms of Use. Nullable so the admin can clear an
      // existing value by sending null; max 20k chars is plenty for
      // typical legal copy without inviting abuse.
      terms_of_use: z.string().max(20000).nullable().optional(),
    }).strict(),
  ),
  async (c) => {
    const id = c.req.param("id");
    const body = c.req.valid("json");
    if (Object.keys(body).length === 0) {
      return c.json({ error: "No fields to update" }, 400);
    }
    if (body.name !== undefined) {
      await sql`
        UPDATE tenants
           SET name = ${body.name},
               updated_at = NOW()
         WHERE id = ${id}
      `;
    }
    if (body.allow_custom_leagues !== undefined) {
      await sql`
        UPDATE tenants
           SET allow_custom_leagues = ${body.allow_custom_leagues},
               updated_at = NOW()
         WHERE id = ${id}
      `;
    }
    if (body.show_teaser_competitions !== undefined) {
      await sql`
        UPDATE tenants
           SET show_teaser_competitions = ${body.show_teaser_competitions},
               updated_at = NOW()
         WHERE id = ${id}
      `;
    }
    if (body.terms_of_use !== undefined) {
      // Empty string → store as NULL so the frontend's "is there a ToU
      // for this tenant?" check stays a single nullness check rather
      // than having to distinguish "" from null.
      const value =
        body.terms_of_use === null || body.terms_of_use.trim() === ""
          ? null
          : body.terms_of_use;
      await sql`
        UPDATE tenants
           SET terms_of_use = ${value},
               updated_at = NOW()
         WHERE id = ${id}
      `;
    }
    const rows = await sql`SELECT * FROM tenants WHERE id = ${id} LIMIT 1`;
    if (rows.length === 0) return c.json({ error: "Tenant not found" }, 404);
    return c.json(rows[0]);
  },
);

// ── Per-tenant competition feature flags ────────────────────────────────
// A tenant only sees competitions with a tenant_competitions row (see
// GET /api/competitions). These two endpoints power the admin page's
// "Competitions" toggle section. New competitions default OFF everywhere,
// enabling a staged rollout (dogfood tenant first, then customers).

router.get("/:id/competitions", requireAdmin, async (c) => {
  const id = c.req.param("id");
  // `enabled` mirrors what the TENANT actually sees (enabled_at <= now());
  // a future enabled_at is a scheduled go-live, surfaced separately as
  // `scheduled_at` so the admin UI can say "off, flips on <date>" instead
  // of lying in either direction.
  const rows = await sql`
    SELECT comp.id, comp.slug, comp.name, comp.short_name, comp.season,
           comp.format, comp.is_active, comp.display_order,
           (tc.tenant_id IS NOT NULL AND tc.enabled_at <= now()) AS enabled,
           (CASE WHEN tc.enabled_at > now() THEN tc.enabled_at END) AS scheduled_at
      FROM public.competitions comp
      LEFT JOIN public.tenant_competitions tc
        ON tc.competition_id = comp.id AND tc.tenant_id = ${id}
     ORDER BY comp.display_order ASC, comp.slug ASC
  `;
  return c.json(rows);
});

router.put(
  "/:id/competitions/:competitionId",
  requireAdmin,
  zValidator("json", z.object({ enabled: z.boolean() })),
  async (c) => {
    const tenantId = c.req.param("id");
    const competitionId = c.req.param("competitionId");
    const { enabled } = c.req.valid("json");
    if (enabled) {
      // "Enable now" must also override a SCHEDULED (future enabled_at) row
      // — with DO NOTHING the admin's click would silently change nothing.
      // LEAST() makes it live immediately while never postponing a row
      // that's already live.
      await sql`
        INSERT INTO public.tenant_competitions (tenant_id, competition_id)
        VALUES (${tenantId}, ${competitionId})
        ON CONFLICT (tenant_id, competition_id)
        DO UPDATE SET enabled_at = LEAST(public.tenant_competitions.enabled_at, now())
      `;
    } else {
      // Disabling also cancels a pending schedule (the row is the schedule).
      await sql`
        DELETE FROM public.tenant_competitions
         WHERE tenant_id = ${tenantId} AND competition_id = ${competitionId}
      `;
    }
    return c.json({ ok: true, enabled });
  },
);

// 60s in-memory cache for the by-uid tenant resolve. It runs on EVERY
// app mount, and its user_count subquery was seq-scanning 726K
// prediction rows per call until idx_predictions_tenant_id landed
// (2026-06-11, applied to prod + migration) — at matchday login-surge
// rates that alone exhausted the DB pool and slowed the whole app.
// Indexed it's ~5ms, but there's still no reason to run it thousands
// of times a minute. Single API instance → module-level cache is safe;
// 60s staleness on tenant branding/user-count is invisible.
const tenantByUidCache = new Map<string, { body: unknown; expires: number }>();
const TENANT_TTL_MS = 60_000;

router.get("/by-uid/:uid", async (c) => {
  const uid = c.req.param("uid");
  const cached = tenantByUidCache.get(uid);
  if (cached && cached.expires > Date.now()) {
    return c.json(cached.body as Record<string, unknown>);
  }
  // Inline `user_count` via a correlated subquery so the tenant
  // resolve (called on every page mount) already carries the
  // headline number the LeaguesView shows next to "All players".
  // One round-trip; indexes on the three source columns
  // (oidc_identities tenant unique, idx_predictions_tenant_id,
  // leagues.tenant_id) keep it cheap.
  //
  // Union of three sources because no single table is a complete
  // membership list:
  //   - oidc_identities: every OIDC-authed user (most prod tenants)
  //   - predictions: every user who's submitted at least one pick
  //     in this tenant — covers OTP-auth tenants that don't
  //     populate oidc_identities, plus dev-login users
  //   - league_members ∘ leagues: every user who's joined a league
  //     here, even if they haven't predicted yet
  //
  // DISTINCT user_id collapses the overlap. The outer COUNT then
  // gives one bigint we cast to int on the JS side.
  const rows = await sql<Array<Record<string, unknown> & { user_count: bigint }>>`
    SELECT t.*,
           (
             SELECT COUNT(DISTINCT user_id)::bigint FROM (
               SELECT user_id FROM public.oidc_identities WHERE tenant_id = t.id
               UNION
               SELECT user_id FROM public.predictions WHERE tenant_id = t.id
               UNION
               SELECT lm.user_id
                 FROM public.league_members lm
                 JOIN public.leagues l ON l.id = lm.league_id
                WHERE l.tenant_id = t.id
             ) AS distinct_members
           ) AS user_count
      FROM public.tenants t
     WHERE t.uid = ${uid}
     LIMIT 1
  `;
  if (rows.length === 0) return c.json({ error: "Tenant not found" }, 404);
  const row = rows[0]!;
  const body = { ...row, user_count: Number(row.user_count) };
  tenantByUidCache.set(uid, { body, expires: Date.now() + TENANT_TTL_MS });
  return c.json(body);
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

// Admin-facing tenant users list. Includes per-user prediction count +
// total points (same formula as the leaderboard: 3pts exact, 1pt correct
// result, plus boost awards and tenant custom boosts) so the admin can
// see at a glance who's engaged. `lastActive` was previously a stub field
// that never got populated — replaced by these two real metrics.
router.get("/:id/users", requireAdmin, async (c) => {
  const tenantId = c.req.param("id");
  const rows = await sql`
    WITH tenant_users AS (
      SELECT u.id AS user_id, u.email, u.created_at,
             p.display_name, p.avatar_emoji,
             oi.oidc_subject, oi.created_at AS identity_linked_at
      FROM oidc_identities oi
      INNER JOIN public.users u ON u.id = oi.user_id
      LEFT JOIN profiles p ON p.user_id = u.id
      WHERE oi.tenant_id = ${tenantId}
    ),
    match_pts AS (
      SELECT pr.user_id,
             SUM(
               CASE
                 WHEN lm.home_score IS NULL OR lm.away_score IS NULL THEN 0
                 WHEN pr.home_score = lm.home_score AND pr.away_score = lm.away_score THEN 3
                 WHEN SIGN(pr.home_score - pr.away_score) = SIGN(lm.home_score - lm.away_score) THEN 1
                 ELSE 0
               END
             ) AS pts,
             COUNT(*) AS pred_count
      FROM predictions pr
      INNER JOIN live_matches lm ON lm.match_id = pr.match_id
      WHERE pr.tenant_id = ${tenantId}
      GROUP BY pr.user_id
    ),
    boost_pts AS (
      SELECT bp.user_id,
             SUM(
               CASE
                 WHEN br.result_team_code   IS NOT NULL AND bp.predicted_team_code   = ANY(string_to_array(br.result_team_code, ','))   THEN ba.points_value
                 WHEN br.result_player_name IS NOT NULL AND bp.predicted_player_name = ANY(string_to_array(br.result_player_name, ',')) THEN ba.points_value
                 ELSE 0
               END
             ) AS pts
      FROM boost_predictions bp
      INNER JOIN boost_awards ba ON ba.id = bp.award_id
      LEFT JOIN boost_results br ON br.award_id = bp.award_id
      WHERE bp.tenant_id = ${tenantId}
      GROUP BY bp.user_id
    ),
    custom_pts AS (
      SELECT cbp.user_id,
             SUM(
               CASE
                 WHEN cbr.result_team_code   IS NOT NULL AND cbp.predicted_team_code   = ANY(string_to_array(cbr.result_team_code, ','))   THEN cb.points_value
                 WHEN cbr.result_player_name IS NOT NULL AND cbp.predicted_player_name = ANY(string_to_array(cbr.result_player_name, ',')) THEN cb.points_value
                 ELSE 0
               END
             ) AS pts
      FROM tenant_custom_boost_predictions cbp
      INNER JOIN tenant_custom_boosts cb ON cb.id = cbp.custom_boost_id
      LEFT JOIN tenant_custom_boost_results cbr ON cbr.custom_boost_id = cbp.custom_boost_id
      WHERE cb.tenant_id = ${tenantId}
      GROUP BY cbp.user_id
    )
    SELECT
      tu.user_id                                       AS id,
      tu.email,
      tu.created_at,
      tu.display_name,
      tu.avatar_emoji,
      tu.oidc_subject,
      tu.identity_linked_at,
      COALESCE(mp.pred_count, 0)                       AS prediction_count,
      COALESCE(mp.pts, 0) + COALESCE(bp.pts, 0) + COALESCE(cp.pts, 0) AS total_points
    FROM tenant_users tu
    LEFT JOIN match_pts  mp ON mp.user_id = tu.user_id
    LEFT JOIN boost_pts  bp ON bp.user_id = tu.user_id
    LEFT JOIN custom_pts cp ON cp.user_id = tu.user_id
    ORDER BY tu.created_at DESC
  `;
  return c.json(rows);
});

// GET /tenants/:id/results-export.csv
//
// Wide-format CSV dump of every member's predictions in this tenant —
// one row per user, columns laid out as:
//   identity → leaderboard summary → per-match → per built-in boost
//   → per custom boost.
//
// Heavy work (six SELECTs + per-user pivot) is in lib/resultsExport.ts
// so the route stays a thin orchestrator: auth-gate, fetch the
// tenant's slug for the filename, hand off, set headers.
router.get("/:id/results-export.csv", requireAdmin, async (c) => {
  const tenantId = c.req.param("id");

  // Look up the tenant for the filename slug; if missing, 404 before
  // doing the expensive export work.
  const tenantRows = await sql<{ uid: string; name: string }[]>`
    SELECT uid, name FROM public.tenants WHERE id = ${tenantId} LIMIT 1
  `;
  if (tenantRows.length === 0) return c.json({ error: "Tenant not found" }, 404);
  const tenant = tenantRows[0]!;

  let csv: string;
  try {
    csv = await buildResultsCsv(sql, tenantId);
  } catch (err) {
    // Hono's default 500 hides the actual error message. Log it
    // explicitly so the api pod logs surface column-name typos /
    // schema mismatches without us having to grep the stack trace.
    console.error("[results-export] failed for tenant", tenantId, err);
    return c.json(
      { error: err instanceof Error ? err.message : "Export failed" },
      500,
    );
  }

  // Filename: "<tenant-uid>-results-<YYYY-MM-DD>.csv". uid already
  // URL-safe (the "<slug>-<12-hex>" form created at tenant insert) so
  // no further escaping is needed.
  const today = new Date().toISOString().slice(0, 10);
  const filename = `${tenant.uid}-results-${today}.csv`;

  return new Response(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      // Quote the filename so commas / spaces inside future tenant
      // slugs don't break Content-Disposition parsing.
      "Content-Disposition": `attachment; filename="${filename}"`,
      // No-cache: results are dynamic (matches finishing, points
      // recomputing), and admins re-pull this throughout the
      // tournament. Avoid intermediaries serving stale data.
      "Cache-Control": "no-store",
    },
  });
});

// GET /tenants/:id/leagues-export.csv
//
// Per-league standings for this tenant — long format, one row per league
// member ranked WITHIN the league (rank 1 = that league's winner). Built for
// customers who run a league per department and want each one's winner. Points
// + ranking reuse the live leaderboard scoring; see lib/leaguesExport.ts.
router.get("/:id/leagues-export.csv", requireAdmin, async (c) => {
  const tenantId = c.req.param("id");

  const tenantRows = await sql<{ uid: string; name: string }[]>`
    SELECT uid, name FROM public.tenants WHERE id = ${tenantId} LIMIT 1
  `;
  if (tenantRows.length === 0) return c.json({ error: "Tenant not found" }, 404);
  const tenant = tenantRows[0]!;

  let csv: string;
  try {
    csv = await buildLeaguesCsv(sql, tenantId);
  } catch (err) {
    console.error("[leagues-export] failed for tenant", tenantId, err);
    return c.json(
      { error: err instanceof Error ? err.message : "Export failed" },
      500,
    );
  }

  const today = new Date().toISOString().slice(0, 10);
  const filename = `${tenant.uid}-leagues-${today}.csv`;

  return new Response(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
});

export default router;
