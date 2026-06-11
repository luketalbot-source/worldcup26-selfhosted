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

const router = new Hono<AuthEnv>();

interface PlayerRow {
  id: string;
  team_code: string;
  full_name: string;
  position: string | null;
  shirt_number: number | null;
  date_of_birth: string | null;
}

// Public read — every signed-in user needs this to render the picker.
// Returns the full roster; the frontend filters/sorts client-side
// (the list is ~1300 rows, well under the threshold where you'd
// paginate or push search to the server).
router.get("/", requireAuth, async (c) => {
  const rows = await sql<PlayerRow[]>`
    SELECT id, team_code, full_name, position, shirt_number, date_of_birth
    FROM public.live_players
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

    if (replace) {
      await sql`DELETE FROM public.live_players WHERE team_code = ${team_code}`;
    }

    // Insert each row with ON CONFLICT-DO-UPDATE so a non-replace import
    // updates position/shirt_number/dob if the admin re-paste corrects
    // those, without duplicating the name row.
    let inserted = 0;
    let updated = 0;
    for (const p of players) {
      const searchable = normaliseForSearch(p.full_name);
      const result = await sql<{ inserted: boolean }[]>`
        INSERT INTO public.live_players
          (team_code, full_name, searchable, position, shirt_number, date_of_birth, updated_at)
        VALUES
          (${team_code},
           ${p.full_name},
           ${searchable},
           ${p.position ?? null},
           ${p.shirt_number ?? null},
           ${p.date_of_birth ?? null},
           NOW())
        ON CONFLICT (team_code, full_name) DO UPDATE SET
          searchable    = EXCLUDED.searchable,
          position      = EXCLUDED.position,
          shirt_number  = EXCLUDED.shirt_number,
          date_of_birth = EXCLUDED.date_of_birth,
          updated_at    = NOW()
        RETURNING (xmax = 0) AS inserted
      `;
      if (result[0]?.inserted) inserted++;
      else updated++;
    }

    const counts = await sql<{ total: bigint }[]>`
      SELECT COUNT(*)::bigint AS total
      FROM public.live_players
      WHERE team_code = ${team_code}
    `;
    return c.json({
      team_code,
      inserted,
      updated,
      total: Number(counts[0]?.total ?? 0),
    });
  },
);

// Admin: wipe a team's roster (use before a fresh-import workflow that
// doesn't pass `replace: true` — kept separate so the admin can clear
// without re-uploading immediately).
router.delete("/admin/by-team/:teamCode", requireAdmin, async (c) => {
  const teamCode = c.req.param("teamCode").toUpperCase();
  const result = await sql<{ id: string }[]>`
    DELETE FROM public.live_players
    WHERE team_code = ${teamCode}
    RETURNING id
  `;
  return c.json({ team_code: teamCode, deleted: result.length });
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

  let fdResp: Response;
  try {
    fdResp = await fetch("https://api.football-data.org/v4/competitions/WC/teams", {
      headers: { "X-Auth-Token": apiKey },
    });
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
      tla?: string;
      squad?: Array<{
        name?: string;
        position?: string;
        shirtNumber?: number | null;
        dateOfBirth?: string;
      }>;
    }>;
  };
  const teams = data.teams ?? [];

  let teamsTouched = 0;
  let rowsInserted = 0;
  const skipped: string[] = [];

  for (const team of teams) {
    if (!team.tla) continue;
    // Defensive: a 0-row squad from FD almost always indicates a
    // transient glitch, not "team disbanded" — keep yesterday's data
    // rather than wiping a usable roster. Surfaced in `skipped` so
    // the admin can see why a team's count didn't change.
    const squad = (team.squad ?? []).filter((p) => p?.name && p.name.trim().length > 0);
    if (squad.length === 0) {
      skipped.push(team.tla);
      continue;
    }
    try {
      // Per-team transaction: a DELETE-then-INSERT outside a
      // transaction would briefly show an empty roster to anyone
      // hitting GET /players during the gap. sql.begin() guarantees
      // the rebuild is atomic — readers see either the old set or
      // the new set, never an intermediate state.
      // Single bulk INSERT per team instead of one round-trip per player —
      // the old loop issued up to ~1,300 sequential queries across a full
      // 48-team sync, hogging pool connections. ON CONFLICT DO NOTHING
      // still dedupes (including duplicates within the same batch).
      const rows = squad.map((p) => {
        const fullName = p.name!.trim();
        return {
          team_code: team.tla!,
          full_name: fullName,
          searchable: normaliseForSearch(fullName),
          position: normalisePosition(p.position),
          shirt_number: typeof p.shirtNumber === "number" ? p.shirtNumber : null,
          date_of_birth: p.dateOfBirth ?? null,
          updated_at: new Date(),
        };
      });
      await sql.begin(async (tx) => {
        await tx`DELETE FROM public.live_players WHERE team_code = ${team.tla!}`;
        await tx`
          INSERT INTO public.live_players ${tx(rows, 'team_code', 'full_name', 'searchable', 'position', 'shirt_number', 'date_of_birth', 'updated_at')}
          ON CONFLICT (team_code, full_name) DO NOTHING
        `;
      });
      teamsTouched++;
      rowsInserted += squad.length;
    } catch (err) {
      console.error(`[players/sync-from-fd] squad for ${team.tla} failed:`, err);
      skipped.push(team.tla);
    }
  }

  return c.json({
    teams_in_response: teams.length,
    teams_synced: teamsTouched,
    rows_inserted: rowsInserted,
    skipped, // TLAs we didn't touch (empty squad from FD, or per-team error)
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
