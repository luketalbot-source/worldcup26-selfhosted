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

const router = new Hono<AuthEnv>();

interface PlayerRow {
  id: string;
  team_code: string;
  full_name: string;
  position: string | null;
  shirt_number: number | null;
  date_of_birth: string | null;
}

// Normalise a name to its searchable form. Lowercased and accent-stripped
// using the standard Unicode decomposition + diacritic-removal trick, so
// "Lionel Messi" and "lionel messi" and "Lìónél Mëssi" all collapse to
// the same string. Runs both at import time (writes the column) and at
// query time (in the typeahead) so the comparison is consistent.
function normaliseForSearch(s: string): string {
  return s
    .normalize("NFD")
    // U+0300..U+036F — Unicode combining diacritical marks. NFD splits
    // an accented char like "é" into "e" + this codepoint, then we drop
    // the mark. Explicit unicode escapes keep the regex source-encoding
    // agnostic (literal combining chars in source files have surprised
    // both linters and editors in the past).
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
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
