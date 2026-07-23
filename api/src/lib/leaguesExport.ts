// Per-tenant LEAGUE standings CSV — drives GET /tenants/:id/leagues-export.csv.
// Customers create a league per department and want each league's winner, so
// this is a long-format dump: one row per (league, member), ranked WITHIN the
// league. Rank 1 = that league's winner.
//
// Points reuse the EXACT scoring of the live leaderboard (scoreMatch +
// boostPoints from resultsExport.ts) so the standings here match what players
// see in-app. Leagues are competition-scoped (leagues.competition_id): a
// league counts only its own game's match + boost points, so a user's totals
// can differ between their WC league and their Bundesliga league. Totals are
// therefore computed PER SCOPE, mirroring leaderboard.ts — including its
// custom-boost rule (a NULL-scoped custom boost counts in every scope) and
// its 5-stage tiebreak, so rank 1 here is the same winner the in-app league
// leaderboard shows. A NULL-scope (legacy) league counts everything combined.

import type { Sql } from "postgres";
import { scoreMatch, boostPoints, type Match, type MatchPrediction } from "./resultsExport";

interface BoostRow { id: string; points_value: number; prediction_type: "team" | "player"; competition_id: string; }
interface BoostResultRow { award_id: string; result_team_code: string | null; result_player_name: string | null; }
interface BoostPredRow { user_id: string; award_id: string; predicted_team_code: string | null; predicted_player_name: string | null; }
interface CustomBoostRow { id: string; points_value: number; prediction_type: "team" | "player"; competition_id: string | null; }
interface CustomResultRow { custom_boost_id: string; result_team_code: string | null; result_player_name: string | null; }
interface CustomPredRow { user_id: string; custom_boost_id: string; predicted_team_code: string | null; predicted_player_name: string | null; }
interface LeagueRow { id: string; name: string; competition_id: string | null; }
interface MemberRow { league_id: string; user_id: string; }
interface MemberProfile { user_id: string; display_name: string | null; email: string | null; }

interface MemberTotals { points: number; exact: number; correct: number; goalDiff: number; picks: number; }

// RFC-4180 cell escape (league names can contain commas, e.g. "Sales, EMEA").
function csvCell(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  if (s === "") return "";
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

export async function buildLeaguesCsv(sql: Sql, tenantId: string): Promise<string> {
  const header = ["league", "rank", "player", "email", "points", "league_id"];
  const BOM = "﻿";

  // 1) Leagues + memberships for this tenant.
  const leagues = await sql<LeagueRow[]>`
    SELECT id, name, competition_id FROM public.leagues
     WHERE tenant_id = ${tenantId}
     ORDER BY name ASC, id ASC
  `;
  const members = await sql<MemberRow[]>`
    SELECT lm.league_id, lm.user_id
      FROM public.league_members lm
      JOIN public.leagues l ON l.id = lm.league_id
     WHERE l.tenant_id = ${tenantId}
  `;
  if (leagues.length === 0 || members.length === 0) {
    return BOM + header.join(",") + "\n";
  }

  // 2) Member identities (subquery IN — no array params).
  const profiles = await sql<MemberProfile[]>`
    SELECT DISTINCT u.id AS user_id, p.display_name, u.email
      FROM public.users u
      LEFT JOIN public.profiles p ON p.user_id = u.id
     WHERE u.id IN (
       SELECT lm.user_id FROM public.league_members lm
         JOIN public.leagues l ON l.id = lm.league_id
        WHERE l.tenant_id = ${tenantId}
     )
  `;
  const profileById = new Map(profiles.map((p) => [p.user_id, p]));

  // 3) Scoring inputs (same sources as the leaderboard / results export),
  //    each carrying its competition so totals can be computed per scope.
  const matches = await sql<(Match & { competition_id: string })[]>`
    SELECT match_id, match_date, home_team_code, home_team_name,
           away_team_code, away_team_name, home_score, away_score,
           penalty_home_score, penalty_away_score, duration, competition_id
      FROM public.live_matches
  `;
  const matchById = new Map(matches.map((m) => [m.match_id, m]));

  const matchPreds = await sql<MatchPrediction[]>`
    SELECT user_id, match_id, home_score, away_score,
           penalty_home_score, penalty_away_score
      FROM public.predictions WHERE tenant_id = ${tenantId}
  `;
  const boosts = await sql<BoostRow[]>`SELECT id, points_value, prediction_type, competition_id FROM public.boost_awards`;
  const boostById = new Map(boosts.map((b) => [b.id, b]));
  const boostResults = new Map(
    (await sql<BoostResultRow[]>`SELECT award_id, result_team_code, result_player_name FROM public.boost_results`)
      .map((r) => [r.award_id, r]),
  );
  const boostPreds = await sql<BoostPredRow[]>`
    SELECT user_id, award_id, predicted_team_code, predicted_player_name
      FROM public.boost_predictions WHERE tenant_id = ${tenantId}
  `;
  const customBoosts = await sql<CustomBoostRow[]>`
    SELECT id, points_value, prediction_type, competition_id FROM public.tenant_custom_boosts WHERE tenant_id = ${tenantId}
  `;
  const customById = new Map(customBoosts.map((b) => [b.id, b]));
  const customResults = new Map(
    (await sql<CustomResultRow[]>`
      SELECT cbr.custom_boost_id, cbr.result_team_code, cbr.result_player_name
        FROM public.tenant_custom_boost_results cbr
        JOIN public.tenant_custom_boosts cb ON cb.id = cbr.custom_boost_id
       WHERE cb.tenant_id = ${tenantId}
    `).map((r) => [r.custom_boost_id, r]),
  );
  const customPreds = await sql<CustomPredRow[]>`
    SELECT cbp.user_id, cbp.custom_boost_id, cbp.predicted_team_code, cbp.predicted_player_name
      FROM public.tenant_custom_boost_predictions cbp
      JOIN public.tenant_custom_boosts cb ON cb.id = cbp.custom_boost_id
     WHERE cb.tenant_id = ${tenantId}
  `;

  // 4) Per-user totals, computed PER COMPETITION SCOPE and memoised — a user
  //    in a WC league and a Bundesliga league has different totals in each.
  //    Scope null = combined (legacy leagues), matching leaderboard.ts.
  const totalsByScope = new Map<string, Map<string, MemberTotals>>();
  const totalsForScope = (scope: string | null): Map<string, MemberTotals> => {
    const key = scope ?? "";
    const cached = totalsByScope.get(key);
    if (cached) return cached;

    const totals = new Map<string, MemberTotals>();
    const get = (uid: string): MemberTotals => {
      let t = totals.get(uid);
      if (!t) { t = { points: 0, exact: 0, correct: 0, goalDiff: 0, picks: 0 }; totals.set(uid, t); }
      return t;
    };
    // Count + score only predictions that join a real match/boost IN SCOPE —
    // mirrors the leaderboard's CTEs (the competition filter sits on the same
    // join there, so the `picks` tiebreak matches in-app rank; stale R16+
    // bracket-slot ids that don't join are excluded, as there).
    for (const p of matchPreds) {
      const m = matchById.get(p.match_id);
      if (!m || (scope !== null && m.competition_id !== scope)) continue;
      const t = get(p.user_id);
      t.picks++;
      const s = scoreMatch(p, m);
      if (s.pts === "") continue;
      t.points += s.pts;
      if (s.isExact) t.exact++;
      else if (s.isCorrectResult) t.correct++;
      t.goalDiff += s.goalDiff;
    }
    for (const p of boostPreds) {
      const b = boostById.get(p.award_id);
      if (!b || (scope !== null && b.competition_id !== scope)) continue;
      const t = get(p.user_id);
      t.picks++;
      const pts = boostPoints(p, boostResults.get(p.award_id), b.points_value, b.prediction_type);
      if (typeof pts === "number") t.points += pts;
    }
    for (const p of customPreds) {
      const cb = customById.get(p.custom_boost_id);
      // NULL-scoped custom boosts apply to every competition — same rule as
      // leaderboard.ts's custom-boost predicate.
      if (!cb || (scope !== null && cb.competition_id !== null && cb.competition_id !== scope)) continue;
      const t = get(p.user_id);
      t.picks++;
      const pts = boostPoints(p, customResults.get(p.custom_boost_id), cb.points_value, cb.prediction_type);
      if (typeof pts === "number") t.points += pts;
    }

    totalsByScope.set(key, totals);
    return totals;
  };

  // 5) Group members by league, rank within each (5-stage tiebreak, RANK()
  //    semantics — ties share a rank), emit rows.
  const membersByLeague = new Map<string, string[]>();
  for (const m of members) {
    const arr = membersByLeague.get(m.league_id) ?? [];
    arr.push(m.user_id);
    membersByLeague.set(m.league_id, arr);
  }

  const ZERO: MemberTotals = { points: 0, exact: 0, correct: 0, goalDiff: 0, picks: 0 };
  const lines: string[] = [header.map(csvCell).join(",")];
  for (const league of leagues) {
    const totals = totalsForScope(league.competition_id ?? null);
    const ranked = (membersByLeague.get(league.id) ?? [])
      .map((uid) => {
        const t = totals.get(uid) ?? ZERO;
        const prof = profileById.get(uid);
        return { uid, name: prof?.display_name ?? "", email: prof?.email ?? "", ...t };
      })
      .sort((a, b) => {
        if (a.points !== b.points) return b.points - a.points;
        if (a.exact !== b.exact) return b.exact - a.exact;
        if (a.correct !== b.correct) return b.correct - a.correct;
        if (a.goalDiff !== b.goalDiff) return a.goalDiff - b.goalDiff; // closer = better
        if (a.picks !== b.picks) return b.picks - a.picks;
        const an = a.name.toLowerCase(), bn = b.name.toLowerCase();
        if (an !== bn) return an.localeCompare(bn);
        return a.uid.localeCompare(b.uid);
      });

    let rank = 0;
    let lastKey = "";
    ranked.forEach((r, i) => {
      const key = `${r.points}|${r.exact}|${r.correct}|${r.goalDiff}|${r.picks}`;
      if (key !== lastKey) { rank = i + 1; lastKey = key; }
      lines.push([league.name, rank, r.name, r.email, r.points, league.id].map(csvCell).join(","));
    });
  }

  return BOM + lines.join("\n") + "\n";
}
