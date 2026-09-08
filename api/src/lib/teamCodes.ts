// Per-competition team-code resolution.
//
// FD's TLA is NOT unique within a competition: in CL 2026/27 both
// FC Bayern München and FC Barcelona arrive as "FCB". Team codes drive
// standings grouping, crest lookups, boost team picks and player rosters,
// so a collision silently merges two clubs into one. This module assigns
// every participant a unique code, deterministically:
//
//   - participants are processed sorted by FD team id, so the SAME club
//     wins the contested TLA on every sync regardless of payload order
//     (Bayern id 5 < Barcelona id 81 → Bayern keeps FCB, matching its
//     Bundesliga code; Barcelona derives "BAR");
//   - a loser's code is derived from its shortName/name — first three
//     characters, extended letter by letter until unique, with the FD id
//     as a last-resort suffix.
//
// Every consumer that writes or joins on team codes for a competition
// (match upserts, the teams roster sync, the player-squad import) must
// resolve codes through the same map, or rosters and fixtures drift apart.

export interface CodeParticipant {
  id: number;
  tla?: string | null;
  shortName?: string | null;
  name?: string | null;
}

export function buildTeamCodes(participants: CodeParticipant[]): Map<number, string> {
  // Dedup by FD id (a club appears in many fixtures), keep richest fields.
  const byId = new Map<number, CodeParticipant>();
  for (const p of participants) {
    if (p?.id == null) continue;
    const prev = byId.get(p.id);
    byId.set(p.id, {
      id: p.id,
      tla: p.tla ?? prev?.tla ?? null,
      shortName: p.shortName ?? prev?.shortName ?? null,
      name: p.name ?? prev?.name ?? null,
    });
  }

  const sorted = [...byId.values()].sort((a, b) => a.id - b.id);
  const claimed = new Set<string>();
  const out = new Map<number, string>();

  for (const t of sorted) {
    const preferred =
      t.tla?.trim().toUpperCase() ||
      deriveBase(t)?.substring(0, 3) ||
      `T${t.id}`;

    let code = preferred;
    if (claimed.has(code)) {
      const base = deriveBase(t) ?? "";
      let len = 3;
      code = base.substring(0, len) || `${preferred}${t.id}`;
      while (claimed.has(code) && len < base.length) {
        len += 1;
        code = base.substring(0, len);
      }
      if (claimed.has(code)) code = `${preferred}${t.id}`;
    }
    claimed.add(code);
    out.set(t.id, code);
  }
  return out;
}

function deriveBase(t: CodeParticipant): string | null {
  const src = t.shortName || t.name;
  if (!src) return null;
  const cleaned = src.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return cleaned.length > 0 ? cleaned : null;
}
