// Player rosters API.
//
// Public GET — every authenticated user needs the roster to render the
// boost picker. Admin-only writes for import / clear, since rosters are
// curated (FD's free tier doesn't cover national teams).
//
// Why a dedicated route file rather than tacking onto admin.ts: the
// public GET wouldn't belong under `/api/admin/`, and bundling the GET
// next to the admin writes keeps the player-related code in one place.

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { sql } from "../db";
import { requireAdmin, requireAuth, type AuthEnv } from "../auth/middleware";
import { normaliseForSearch } from "../lib/normalise";
import { fdClient } from "../lib/fdClient";
import { getCompetitionBySlug } from "../lib/competitions";
import { buildTeamCodes } from "../lib/teamCodes";

const router = new Hono<AuthEnv>();

// Competitions with a squad backfill loop currently in flight (see
// sync-from-fd) — guards against concurrent duplicate backfills.
const squadBackfillRunning = new Set<string>();

interface PlayerRow {
  id: string;
  team_code: string;
  full_name: string;
  position: string | null;
  shirt_number: number | null;
  date_of_birth: string | null;
}

// Public read — every signed-in user needs this to render the picker.
// Returns the roster; the frontend filters/sorts client-side (the list is
// ~1300 rows per competition, well under pagination territory).
// ?competition=<slug> scopes to one competition — REQUIRED once several
// competitions have squads, or rosters with colliding TLAs merge (club
// 'POR' + country 'POR'). No param = all rows (legacy back-compat).
router.get("/", requireAuth, async (c) => {
  const slug = c.req.query("competition");
  let competitionId: string | null = null;
  if (slug) {
    const comp = await getCompetitionBySlug(slug);
    if (!comp) return c.json({ error: `Unknown competition '${slug}'` }, 404);
    competitionId = comp.id;
  }
  const rows = await sql<PlayerRow[]>`
    SELECT id, team_code, full_name, position, shirt_number, date_of_birth
    FROM public.live_players
    WHERE (${competitionId}::uuid IS NULL OR competition_id = ${competitionId})
    ORDER BY team_code ASC, full_name ASC
  `;
  return c.json(rows);
});

const importPlayerSchema = z.object({
  full_name: z.string().min(1).max(120),
  position: z.string().max(40).nullable().optional(),
  shirt_number: z.number().int().min(0).max(999).nullable().optional(),
  date_of_birth: z.string().max(20).nullable().optional(),
});

const importBodySchema = z.object({
  // The team this batch belongs to. Splitting roster imports per-team
  // (rather than one bulk dump) makes partial uploads safe and lets
  // `replace=true` only clear that one team's rows.
  team_code: z
    .string()
    .min(2)
    .max(8)
    .transform((s) => s.toUpperCase()),
  // If true: clear the team's existing roster first, then insert. Use
  // when re-importing after a squad-list change (the natural workflow
  // when a player gets injured replaced). If false: insert-or-update
  // by (team_code, full_name).
  replace: z.boolean().default(false),
  players: z.array(importPlayerSchema).min(1).max(60),
});

// Admin: bulk-import one team's roster.
router.post(
  "/admin/import",
  requireAdmin,
  zValidator("json", importBodySchema),
  async (c) => {
    const { team_code, replace, players } = c.req.valid("json");
    // Manual imports target one competition's roster; defaults to the WC
    // archive slug so the existing admin editor keeps working unchanged.
    const comp = await getCompetitionBySlug(c.req.query("competition") ?? "wc-2026");
    if (!comp) return c.json({ error: "Unknown competition" }, 404);

    if (replace) {
      await sql`
        DELETE FROM public.live_players
         WHERE team_code = ${team_code} AND competition_id = ${comp.id}
      `;
    }

    // UPDATE-then-INSERT rather than ON CONFLICT: the unique constraint
    // migrates from (team_code, full_name) to (competition_id, team_code,
    // full_name) during the Phase B→C window, and a hardcoded conflict
    // target for either regime errors under the other. Admin imports are
    // serial, so check-then-insert has no realistic race.
    let inserted = 0;
    let updated = 0;
    for (const p of players) {
      const searchable = normaliseForSearch(p.full_name);
      const upd = await sql<{ id: string }[]>`
        UPDATE public.live_players SET
          searchable    = ${searchable},
          position      = ${p.position ?? null},
          shirt_number  = ${p.shirt_number ?? null},
          date_of_birth = ${p.date_of_birth ?? null},
          updated_at    = NOW()
        WHERE team_code = ${team_code}
          AND full_name = ${p.full_name}
          AND competition_id = ${comp.id}
        RETURNING id
      `;
      const result = upd.length > 0
        ? [{ inserted: false }]
        : await sql<{ inserted: boolean }[]>`
        INSERT INTO public.live_players
          (team_code, full_name, searchable, position, shirt_number, date_of_birth, competition_id, updated_at)
        VALUES
          (${team_code},
           ${p.full_name},
           ${searchable},
           ${p.position ?? null},
           ${p.shirt_number ?? null},
           ${p.date_of_birth ?? null},
           ${comp.id},
           NOW())
        RETURNING true AS inserted
      `;
      if (result[0]?.inserted) inserted++;
      else updated++;
    }

    const counts = await sql<{ total: bigint }[]>`
      SELECT COUNT(*)::bigint AS total
      FROM public.live_players
      WHERE team_code = ${team_code} AND competition_id = ${comp.id}
    `;
    return c.json({
      team_code,
      competition: comp.slug,
      inserted,
      updated,
      total: Number(counts[0]?.total ?? 0),
    });
  },
);

// Admin: wipe a team's roster (use before a fresh-import workflow that
// doesn't pass `replace: true` — kept separate so the admin can clear
// without re-uploading immediately). Competition-scoped like its import/
// sync siblings — an unscoped delete by TLA would also wipe colliding
// rosters in OTHER competitions (e.g. the frozen WC archive's 'POR').
router.delete("/admin/by-team/:teamCode", requireAdmin, async (c) => {
  const teamCode = c.req.param("teamCode").toUpperCase();
  const comp = await getCompetitionBySlug(c.req.query("competition") ?? "wc-2026");
  if (!comp) return c.json({ error: "Unknown competition" }, 404);
  const result = await sql<{ id: string }[]>`
    DELETE FROM public.live_players
    WHERE team_code = ${teamCode} AND competition_id = ${comp.id}
    RETURNING id
  `;
  return c.json({ team_code: teamCode, competition: comp.slug, deleted: result.length });
});

// FD's verbose position labels compress to standard 2-letter codes
// where we know the mapping; anything we don't recognise (e.g.
// "Attacking Midfield" — FD started shipping granular labels in
// May 2026) passes through verbatim so we never lose information.
const FD_POSITION_TO_CODE: Record<string, string> = {
  Goalkeeper: "GK",
  Defence: "DF",
  Midfield: "MF",
  Offence: "FW",
};
function normalisePosition(s: string | null | undefined): string | null {
  if (!s) return null;
  return FD_POSITION_TO_CODE[s] ?? s;
}

type FdSquadPlayer = {
  name?: string;
  position?: string;
  shirtNumber?: number | null;
  dateOfBirth?: string;
};

// Atomic per-(team, competition) roster rebuild. Per-team transaction:
// a DELETE-then-INSERT outside a transaction would briefly show an empty
// roster to anyone hitting GET /players during the gap — sql.begin()
// guarantees readers see either the old set or the new set, never an
// intermediate state. Single bulk INSERT per team (the old loop issued
// up to ~1,300 sequential queries across a full 48-team sync). Dedupe by
// name in JS (FD occasionally repeats a player in a squad payload). No
// ON CONFLICT on the INSERT: the unique constraint migrates from
// (team_code, full_name) to (competition_id, …) during the Phase B→C
// window, and a hardcoded conflict target for either regime errors under
// the other — the DELETE already guarantees a clean slate. The DELETE is
// scoped to the competition: a club playing in both CL and BL1 has
// distinct squad registrations per competition.
async function rebuildSquad(
  competitionId: string,
  teamCode: string,
  squad: FdSquadPlayer[],
): Promise<number> {
  const byName = new Map<string, FdSquadPlayer>();
  for (const p of squad) byName.set(p.name!.trim(), p);
  const rows = [...byName.entries()].map(([fullName, p]) => ({
    team_code: teamCode,
    full_name: fullName,
    searchable: normaliseForSearch(fullName),
    position: normalisePosition(p.position),
    shirt_number: typeof p.shirtNumber === "number" ? p.shirtNumber : null,
    date_of_birth: p.dateOfBirth ?? null,
    competition_id: competitionId,
    updated_at: new Date(),
  }));
  await sql.begin(async (tx) => {
    await tx`
      DELETE FROM public.live_players
       WHERE team_code = ${teamCode} AND competition_id = ${competitionId}
    `;
    await tx`
      INSERT INTO public.live_players ${tx(rows, 'team_code', 'full_name', 'searchable', 'position', 'shirt_number', 'date_of_birth', 'competition_id', 'updated_at')}
    `;
  });
  return rows.length;
}

// Admin: one-button sync of every team's roster from football-data.org.
// FD's /competitions/WC/teams payload now (May 2026 onwards) ships
// inline `squad` arrays for every team — verified 48/48 populated,
// ~1200 rows total. This endpoint pulls that data once, replaces every
// team's roster atomically, and reports back what changed.
//
// Why a manual button instead of folding into the match-sync auto-run:
// admins want explicit control over WHEN squads refresh — particularly
// late in the tournament when FIFA's 25-player final cut publishes
// and an admin wants to "freeze" the picker on the official roster
// rather than have it shift mid-tournament from FD's churn. The
// admin-pasted entries from AdminPlayersEditor remain a separate path
// for one-off fixes; this button is the bulk-refresh.
router.post("/admin/sync-from-fd", requireAdmin, async (c) => {
  const apiKey = process.env.FOOTBALL_DATA_API_KEY;
  if (!apiKey) {
    return c.json({ error: "FOOTBALL_DATA_API_KEY not configured on this server" }, 500);
  }

  // ?competition=<slug>; defaults to the WC archive slug for back-compat
  // with the existing admin button.
  const comp = await getCompetitionBySlug(c.req.query("competition") ?? "wc-2026");
  if (!comp) return c.json({ error: "Unknown competition" }, 404);
  const seasonParam = comp.fd_season != null ? `?season=${comp.fd_season}` : "";

  let fdResp: Response;
  try {
    fdResp = await fdClient.fdFetch(`/competitions/${comp.fd_code}/teams${seasonParam}`, apiKey);
  } catch (err) {
    return c.json(
      { error: `Could not reach football-data.org: ${err instanceof Error ? err.message : String(err)}` },
      502,
    );
  }
  if (!fdResp.ok) {
    return c.json(
      { error: `football-data.org returned ${fdResp.status}: ${await fdResp.text()}` },
      fdResp.status === 429 ? 429 : 502,
    );
  }

  const data = (await fdResp.json()) as {
    teams?: Array<{
      id?: number;
      tla?: string;
      shortName?: string;
      name?: string;
      squad?: Array<{
        name?: string;
        position?: string;
        shirtNumber?: number | null;
        dateOfBirth?: string;
      }>;
    }>;
  };
  const teams = data.teams ?? [];
  // Collision-free per-competition codes (CL: Bayern + Barcelona are both
  // FD-TLA "FCB"). Must match the codes the match/teams sync writes — both
  // resolve via buildTeamCodes over the same participants (sorted by FD id),
  // so squads land under the same team_code the roster and fixtures use.
  const codes = buildTeamCodes(
    teams.filter((t) => t.id != null).map((t) => ({ id: t.id!, tla: t.tla, shortName: t.shortName, name: t.name })),
  );

  let teamsTouched = 0;
  let rowsInserted = 0;
  const skipped: string[] = [];
  const deferred: Array<{ id: number; code: string; tla: string }> = [];

  for (const team of teams) {
    if (!team.tla) continue;
    const code = (team.id != null ? codes.get(team.id) : undefined) ?? team.tla;
    const squad = (team.squad ?? []).filter((p) => p?.name && p.name.trim().length > 0);
    if (squad.length === 0) {
      // FD omits squads entirely from some competitions' bulk payloads
      // (CL 2026/27 returned all 36 teams squadless) — the per-team
      // /teams/<id> endpoint always carries the squad, so fall back to
      // it below. Deferred to a background loop: 36 calls through the
      // 8/min token bucket is ~5 minutes, far past the proxy's request
      // timeout. A squadless team WITHOUT an fd id stays skipped —
      // keeping yesterday's data beats wiping a usable roster on an FD
      // glitch, and `skipped` shows the admin why a count didn't change.
      if (team.id != null) deferred.push({ id: team.id, code, tla: team.tla });
      else skipped.push(team.tla);
      continue;
    }
    try {
      rowsInserted += await rebuildSquad(comp.id, code, squad);
      teamsTouched++;
    } catch (err) {
      console.error(`[players/sync-from-fd] squad for ${team.tla} failed:`, err);
      skipped.push(team.tla);
    }
  }

  // Sweep rows stranded under a code no longer in this competition's
  // resolved set — e.g. squads imported before a TLA collision was
  // resolved (CL "FCB" pre-dating the Bayern/Barcelona split), or after
  // an FD rename shifts a team's code. The known set includes skipped
  // and failed teams (codes come from the payload, not from import
  // success), so their existing rows are never treated as orphans.
  let rowsSwept = 0;
  if (teams.length > 0) {
    const knownCodes = teams
      .filter((t) => t.tla)
      .map((t) => (t.id != null ? codes.get(t.id) : undefined) ?? t.tla!);
    const swept = await sql`
      DELETE FROM public.live_players
       WHERE competition_id = ${comp.id}
         AND NOT (team_code = ANY(${knownCodes}))
      RETURNING id
    `;
    rowsSwept = swept.length;
  }

  // Fire-and-forget (same pattern as admin sync-matches): the FD token
  // bucket paces these to ~8/min, so a 36-team backfill outlives any
  // request timeout. Progress lands in the service log; the admin
  // Players panel counts show the result. One backfill per competition
  // at a time — a re-click mid-run would double every FD call through
  // the shared token bucket and rebuild each team twice for nothing.
  const backfillStarted = deferred.length > 0 && !squadBackfillRunning.has(comp.id);
  if (deferred.length > 0 && !backfillStarted) {
    console.warn(`[players/sync-from-fd] ${comp.slug}: squad backfill already running, not queuing another`);
  }
  if (backfillStarted) {
    squadBackfillRunning.add(comp.id);
    setTimeout(async () => {
      let ok = 0;
      try {
        for (const d of deferred) {
          try {
            const res = await fdClient.fdFetch(`/teams/${d.id}`, apiKey);
            if (!res.ok) {
              console.warn(`[players/sync-from-fd] /teams/${d.id} (${d.tla}) returned ${res.status}`);
              continue;
            }
            const t = (await res.json()) as { squad?: FdSquadPlayer[] };
            const squad = (t.squad ?? []).filter((p) => p?.name && p.name.trim().length > 0);
            if (squad.length === 0) {
              console.warn(`[players/sync-from-fd] /teams/${d.id} (${d.tla}) has no squad either`);
              continue;
            }
            await rebuildSquad(comp.id, d.code, squad);
            ok++;
          } catch (err) {
            console.error(`[players/sync-from-fd] deferred squad for ${d.tla} failed:`, err);
          }
        }
      } finally {
        squadBackfillRunning.delete(comp.id);
      }
      console.log(`[players/sync-from-fd] ${comp.slug}: deferred squad fetches done: ${ok}/${deferred.length}`);
    }, 0);
  }

  return c.json({
    teams_in_response: teams.length,
    teams_synced: teamsTouched,
    rows_inserted: rowsInserted,
    rows_swept: rowsSwept, // orphans under codes not in this comp's resolved set
    queued_team_fetches: backfillStarted ? deferred.length : 0, // squadless in bulk payload; fetching per-team in background
    skipped, // TLAs we didn't touch (no fd id and empty squad, or per-team error)
  });
});

// Admin: counts per team — drives the "what's loaded?" widget in the
// admin Players panel.
router.get("/admin/counts", requireAdmin, async (c) => {
  const rows = await sql<{ team_code: string; player_count: bigint }[]>`
    SELECT team_code, COUNT(*)::bigint AS player_count
    FROM public.live_players
    GROUP BY team_code
    ORDER BY team_code ASC
  `;
  return c.json(
    rows.map((r) => ({
      team_code: r.team_code,
      player_count: Number(r.player_count),
    })),
  );
});

export default router;
