// Per-tenant CSV "results export" — drives the GET
// /api/tenants/:id/results-export.csv endpoint. Pulled out of
// routes/tenants.ts so the route stays a thin orchestrator and this
// file owns the data-pulling + CSV-assembly logic.
//
// Shape (wide, agreed with Luke):
//   one row per tenant member, columns = identity → leaderboard summary
//   → per-match (date, actual, predicted, points, shootout) → per built-in
//   boost (predicted, actual, points) → per tenant-custom boost (same shape).
//
// Scoring rules mirror routes/leaderboard.ts exactly so an export at
// time T agrees with the leaderboard at time T — including the knockout
// penalty-shootout bonus (+1 correct shootout winner, +1 exact shootout
// score) and the decisive-advancer result point. Per-prediction `_pts`
// cells distinguish "wrong" (0) from "not yet decided" (blank).
//
// Scorelines (`_actual`, `_pred`, `_pens`, `_pred_pens`) are written with
// an en-dash ("2–1"), NOT a hyphen: Excel/Sheets coerce a plain "2-1" into
// a date ("02-Jan"), but leave the en-dash form as text. Visually identical
// to a reader; the UTF-8 BOM below makes the non-ASCII char round-trip.

import type { Sql } from "postgres";

// ─── shapes ───────────────────────────────────────────────────────────────

export interface Match {
  match_id: string;
  match_date: string;
  home_team_code: string;
  home_team_name: string;
  away_team_code: string;
  away_team_name: string;
  home_score: number | null;
  away_score: number | null;
  // PSO + duration — surfaced in two extra columns per match in the
  // CSV so an admin pulling the export sees how knockouts were
  // actually decided alongside the regulation+ET score.
  penalty_home_score: number | null;
  penalty_away_score: number | null;
  duration: "REGULAR" | "EXTRA_TIME" | "PENALTY_SHOOTOUT" | null;
}

interface BoostAward {
  id: string;
  slug: string;
  name: string;
  points_value: number;
  prediction_type: "team" | "player";
}

interface BoostResult {
  award_id: string;
  result_team_code: string | null;
  result_player_name: string | null;
}

// Custom boosts have a different shape than built-ins: their schema uses
// `title` rather than `name` and has no `slug` column — we synthesise a
// header-safe slug from the title (or fall back to a short id-suffix)
// when building the CSV columns below.
interface CustomBoost {
  id: string;
  title: string;
  points_value: number;
  prediction_type: "team" | "player";
}

interface CustomBoostResult {
  custom_boost_id: string;
  result_team_code: string | null;
  result_player_name: string | null;
}

interface TenantUser {
  user_id: string;
  email: string | null;
  display_name: string | null;
}

export interface MatchPrediction {
  user_id: string;
  match_id: string;
  home_score: number;
  away_score: number;
  // Predicted shootout score — only set when the user predicted a level
  // (drawn) knockout score, per routes/predictions.ts. Null otherwise.
  penalty_home_score: number | null;
  penalty_away_score: number | null;
}

interface BoostPrediction {
  user_id: string;
  award_id: string;
  predicted_team_code: string | null;
  predicted_player_name: string | null;
}

interface CustomBoostPrediction {
  user_id: string;
  custom_boost_id: string;
  predicted_team_code: string | null;
  predicted_player_name: string | null;
}

// ─── scoring helpers — same logic as routes/leaderboard.ts ────────────────

/**
 * Score one prediction against one match, mirroring routes/leaderboard.ts
 * EXACTLY (base 3/1/0 + knockout penalty logic). Returns the total points
 * plus the tiebreak/breakdown components the wide grid and per-user
 * aggregates need. `pts` is '' (empty cell) for an unplayed match so the
 * export distinguishes "wrong" (0) from "not yet decided" (blank).
 */
export interface ScoredMatch {
  pts: number | "";          // base + shootout bonus; '' when unplayed
  isExact: boolean;          // exact open-play (regulation+ET) score → 3
  isCorrectResult: boolean;  // correct open-play result, not exact → 1 (mutually excl.)
  goalDiff: number;          // |Δhome| + |Δaway| vs open-play score; 0 when unplayed
  penaltyBonus: number;      // shootout-bonus component of pts (0 / 1 / 2)
}

// Exported for resultsExport.test.ts — the knockout penalty branches go
// live the moment a real shootout happens, so the math is unit-tested
// against the leaderboard spec rather than first exercised in prod.
export function scoreMatch(pred: MatchPrediction, m: Match): ScoredMatch {
  if (m.home_score === null || m.away_score === null) {
    return { pts: "", isExact: false, isCorrectResult: false, goalDiff: 0, penaltyBonus: 0 };
  }

  const wentToPens =
    m.duration === "PENALTY_SHOOTOUT" &&
    m.penalty_home_score !== null &&
    m.penalty_away_score !== null;

  const predSign = Math.sign(pred.home_score - pred.away_score);
  const actualSign = Math.sign(m.home_score - m.away_score);
  const isExact = pred.home_score === m.home_score && pred.away_score === m.away_score;
  const isCorrectResult = !isExact && predSign === actualSign;

  // Base result point — same WHEN ordering as the leaderboard CASE.
  let base = 0;
  if (isExact) {
    base = 3;
  } else if (isCorrectResult) {
    base = 1;
  } else if (
    // Decisive-advancer: predicted a winner (not a draw), the match went
    // to pens, and the backed side won the shootout → called who advances.
    wentToPens &&
    pred.home_score !== pred.away_score &&
    Math.sign(pred.home_score - pred.away_score) ===
      Math.sign((m.penalty_home_score as number) - (m.penalty_away_score as number))
  ) {
    base = 1;
  }

  // Shootout bonus — only for a level prediction with a decisive shootout
  // pick on a match that actually went to pens. +1 winner, +1 exact score.
  let penaltyBonus = 0;
  if (
    wentToPens &&
    pred.penalty_home_score !== null &&
    pred.penalty_away_score !== null &&
    pred.penalty_home_score !== pred.penalty_away_score &&
    pred.home_score === pred.away_score
  ) {
    const predWinnerIsHome = pred.penalty_home_score > pred.penalty_away_score;
    const actualWinnerIsHome = (m.penalty_home_score as number) > (m.penalty_away_score as number);
    if (predWinnerIsHome === actualWinnerIsHome) penaltyBonus += 1;
    if (
      pred.penalty_home_score === m.penalty_home_score &&
      pred.penalty_away_score === m.penalty_away_score
    ) {
      penaltyBonus += 1;
    }
  }

  const goalDiff =
    Math.abs(pred.home_score - m.home_score) + Math.abs(pred.away_score - m.away_score);
  return { pts: base + penaltyBonus, isExact, isCorrectResult, goalDiff, penaltyBonus };
}

/** Returns the boost's points_value, 0, or '' (no result row yet). */
function boostPoints(
  pred: { predicted_team_code: string | null; predicted_player_name: string | null },
  result: BoostResult | CustomBoostResult | undefined,
  pointsValue: number,
  predictionType: "team" | "player",
): number | "" {
  if (!result) return "";
  if (predictionType === "team") {
    if (!result.result_team_code) return ""; // result row exists but column blank
    return pred.predicted_team_code === result.result_team_code ? pointsValue : 0;
  }
  // player path
  if (!result.result_player_name) return "";
  return pred.predicted_player_name === result.result_player_name ? pointsValue : 0;
}

// ─── CSV escape ───────────────────────────────────────────────────────────

/**
 * Wrap any value containing comma / quote / newline in double quotes,
 * and double-up any internal quotes. RFC 4180 compliant; Excel happy.
 */
function csvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  const s = String(value);
  if (s === "") return "";
  if (s.includes(",") || s.includes('"') || s.includes("\n") || s.includes("\r")) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

// ─── main entry ───────────────────────────────────────────────────────────

/**
 * Build the full CSV body for one tenant's results.
 *
 * Heavy IO up front (six SELECTs, each tenant-scoped), then a pure-JS
 * pivot to assemble the wide grid. The intermediate maps are O(n) in
 * predictions/users — for the largest realistic tenant (~5k users,
 * 5k * 104 ≈ 520k prediction rows) we're still well under any single-
 * digit-MB memory threshold.
 */
export async function buildResultsCsv(
  sql: Sql,
  tenantId: string,
): Promise<string> {
  // 1) Matches define the per-match column blocks. Ordered by kickoff
  //    so an Excel user can scroll left-to-right and read the tournament
  //    chronologically.
  const matches = await sql<Match[]>`
    SELECT match_id, match_date,
           home_team_code, home_team_name,
           away_team_code, away_team_name,
           home_score, away_score,
           penalty_home_score, penalty_away_score, duration
      FROM public.live_matches
     ORDER BY match_date ASC, match_id ASC
  `;

  // 2) Built-in boost awards in their display order.
  const boosts = await sql<BoostAward[]>`
    SELECT id, slug, name, points_value, prediction_type
      FROM public.boost_awards
     ORDER BY display_order ASC, slug ASC
  `;

  // 3) Built-in boost results — keyed by award_id for O(1) lookup.
  const boostResultRows = await sql<BoostResult[]>`
    SELECT award_id, result_team_code, result_player_name
      FROM public.boost_results
  `;
  const boostResults = new Map(boostResultRows.map((r) => [r.award_id, r]));

  // 4) Tenant-scoped custom boosts. Schema uses `title` (not `name`)
  //    and has no `slug` column — slug is synthesised from the title
  //    below at header-build time.
  const customBoosts = await sql<CustomBoost[]>`
    SELECT id, title, points_value, prediction_type
      FROM public.tenant_custom_boosts
     WHERE tenant_id = ${tenantId}
     ORDER BY display_order ASC, title ASC
  `;

  // Header-safe slug from a free-text title: NFD-decompose accents,
  // lowercase, replace runs of non-alnum with '-', trim, cap length.
  // Collisions resolved by suffixing with the row's index (rare in
  // practice — admins tend to name boosts uniquely).
  const slugify = (s: string): string =>
    s
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "boost";
  const customSlugs: string[] = [];
  const seenSlugs = new Set<string>();
  customBoosts.forEach((cb, i) => {
    let s = slugify(cb.title);
    if (seenSlugs.has(s)) s = `${s}-${i + 1}`;
    seenSlugs.add(s);
    customSlugs.push(s);
  });

  // 5) Custom boost results — scoped to this tenant's custom boosts.
  const customResultRows = await sql<CustomBoostResult[]>`
    SELECT cbr.custom_boost_id, cbr.result_team_code, cbr.result_player_name
      FROM public.tenant_custom_boost_results cbr
      JOIN public.tenant_custom_boosts cb ON cb.id = cbr.custom_boost_id
     WHERE cb.tenant_id = ${tenantId}
  `;
  const customResults = new Map(customResultRows.map((r) => [r.custom_boost_id, r]));

  // 6) Tenant members. Same UNION pattern used by tenants.by-uid
  //    user_count + leaderboard — covers OIDC-auth, OTP-auth, and
  //    league-only-joined users.
  const users = await sql<TenantUser[]>`
    SELECT u.id          AS user_id,
           u.email,
           p.display_name
      FROM public.users u
      LEFT JOIN public.profiles p ON p.user_id = u.id
     WHERE u.id IN (
       SELECT user_id FROM public.oidc_identities WHERE tenant_id = ${tenantId}
       UNION
       SELECT user_id FROM public.predictions WHERE tenant_id = ${tenantId}
       UNION
       SELECT lm.user_id
         FROM public.league_members lm
         JOIN public.leagues l ON l.id = lm.league_id
        WHERE l.tenant_id = ${tenantId}
     )
  `;

  // 7) All match predictions in this tenant. Key by user+match for the
  //    pivot below.
  const matchPredRows = await sql<MatchPrediction[]>`
    SELECT user_id, match_id, home_score, away_score,
           penalty_home_score, penalty_away_score
      FROM public.predictions
     WHERE tenant_id = ${tenantId}
  `;
  const matchPredsByKey = new Map<string, MatchPrediction>();
  for (const p of matchPredRows) matchPredsByKey.set(`${p.user_id}::${p.match_id}`, p);

  // 8) All built-in boost predictions in this tenant.
  const boostPredRows = await sql<BoostPrediction[]>`
    SELECT user_id, award_id, predicted_team_code, predicted_player_name
      FROM public.boost_predictions
     WHERE tenant_id = ${tenantId}
  `;
  const boostPredsByKey = new Map<string, BoostPrediction>();
  for (const p of boostPredRows) boostPredsByKey.set(`${p.user_id}::${p.award_id}`, p);

  // 9) All tenant-custom boost predictions.
  const customPredRows = await sql<CustomBoostPrediction[]>`
    SELECT cbp.user_id, cbp.custom_boost_id, cbp.predicted_team_code, cbp.predicted_player_name
      FROM public.tenant_custom_boost_predictions cbp
      JOIN public.tenant_custom_boosts cb ON cb.id = cbp.custom_boost_id
     WHERE cb.tenant_id = ${tenantId}
  `;
  const customPredsByKey = new Map<string, CustomBoostPrediction>();
  for (const p of customPredRows) customPredsByKey.set(`${p.user_id}::${p.custom_boost_id}`, p);

  // ─── per-user aggregates ────────────────────────────────────────────────
  //
  // Computed in JS rather than SQL so the export's row order and the
  // summary cells use exactly the data we have in memory — no chance
  // of a join misalignment. Mirrors the 5-stage tiebreak in
  // routes/leaderboard.ts.

  interface UserAgg {
    user_id: string;
    email: string | null;
    display_name: string | null;
    total_points: number;
    match_pred_count: number;
    exact_count: number;
    correct_count: number;
    goal_diff_sum: number;
    boost_pred_count: number; // sum of built-in + custom for total_picks
    rank?: number;
  }

  const aggByUser = new Map<string, UserAgg>();
  for (const u of users) {
    aggByUser.set(u.user_id, {
      user_id: u.user_id,
      email: u.email,
      display_name: u.display_name,
      total_points: 0,
      match_pred_count: 0,
      exact_count: 0,
      correct_count: 0,
      goal_diff_sum: 0,
      boost_pred_count: 0,
    });
  }

  // Index actuals by match_id for the loop below.
  const matchById = new Map(matches.map((m) => [m.match_id, m]));

  for (const p of matchPredRows) {
    const agg = aggByUser.get(p.user_id);
    if (!agg) continue; // prediction by a non-tenant user (shouldn't happen)
    agg.match_pred_count++;
    const m = matchById.get(p.match_id);
    if (!m) continue;
    const s = scoreMatch(p, m);
    if (s.pts === "") continue; // match not yet decided
    agg.total_points += s.pts;
    if (s.isExact) agg.exact_count++;
    else if (s.isCorrectResult) agg.correct_count++;
    agg.goal_diff_sum += s.goalDiff;
  }

  const boostById = new Map(boosts.map((b) => [b.id, b]));
  for (const p of boostPredRows) {
    const agg = aggByUser.get(p.user_id);
    if (!agg) continue;
    agg.boost_pred_count++;
    const award = boostById.get(p.award_id);
    if (!award) continue;
    const pts = boostPoints(p, boostResults.get(p.award_id), award.points_value, award.prediction_type);
    if (typeof pts === "number") agg.total_points += pts;
  }

  const customBoostById = new Map(customBoosts.map((b) => [b.id, b]));
  for (const p of customPredRows) {
    const agg = aggByUser.get(p.user_id);
    if (!agg) continue;
    agg.boost_pred_count++;
    const cb = customBoostById.get(p.custom_boost_id);
    if (!cb) continue;
    const pts = boostPoints(p, customResults.get(p.custom_boost_id), cb.points_value, cb.prediction_type);
    if (typeof pts === "number") agg.total_points += pts;
  }

  // 5-stage tiebreak sort, then assign rank with SQL-style RANK() semantics
  // (ties share a rank; subsequent rank skips by group size).
  const sortedUsers: UserAgg[] = [...aggByUser.values()].sort((a, b) => {
    if (a.total_points !== b.total_points) return b.total_points - a.total_points;
    if (a.exact_count !== b.exact_count) return b.exact_count - a.exact_count;
    if (a.correct_count !== b.correct_count) return b.correct_count - a.correct_count;
    if (a.goal_diff_sum !== b.goal_diff_sum) return a.goal_diff_sum - b.goal_diff_sum; // ASC
    const aPicks = a.match_pred_count + a.boost_pred_count;
    const bPicks = b.match_pred_count + b.boost_pred_count;
    if (aPicks !== bPicks) return bPicks - aPicks;
    // stable display order: name ASC, falls back to user_id
    const an = (a.display_name ?? "").toLowerCase();
    const bn = (b.display_name ?? "").toLowerCase();
    if (an !== bn) return an.localeCompare(bn);
    return a.user_id.localeCompare(b.user_id);
  });

  // Assign rank — RANK() semantics, ties on the full 5-tuple share.
  let currentRank = 0;
  let lastKey = "";
  sortedUsers.forEach((u, i) => {
    const picks = u.match_pred_count + u.boost_pred_count;
    const key = `${u.total_points}|${u.exact_count}|${u.correct_count}|${u.goal_diff_sum}|${picks}`;
    if (key !== lastKey) {
      currentRank = i + 1;
      lastKey = key;
    }
    u.rank = currentRank;
  });

  // ─── header rows ────────────────────────────────────────────────────────
  //
  // Heavy headers as agreed: match columns embed date + team codes so a
  // human eyeballing the CSV doesn't have to consult a separate match-id
  // index. Date format YYYYMMDD (sortable in any locale, no comma trap).

  const fmtDate = (iso: string): string => {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    return d.toISOString().slice(0, 10).replace(/-/g, "");
  };

  // Scoreline cells use an en-dash so Excel/Sheets don't read "2-1" as a
  // date — see the file header. fmtScore returns '' for a missing half so
  // unplayed matches / absent predictions stay blank.
  const SCORE_SEP = "–"; // en-dash (U+2013)
  const fmtScore = (h: number | null, a: number | null): string =>
    h !== null && a !== null ? `${h}${SCORE_SEP}${a}` : "";

  // Kickoff → canonical ISO 8601. match_date may arrive as a Date or a
  // string depending on the driver; normalise both. A datetime SHOULD be
  // date-typed in a spreadsheet (unlike a scoreline), so this one stays ISO.
  const fmtKickoff = (v: unknown): string => {
    if (v === null || v === undefined) return "";
    const d = v instanceof Date ? v : new Date(String(v));
    return Number.isNaN(d.getTime()) ? String(v) : d.toISOString();
  };

  const headerCols: string[] = [
    "user_id",
    "display_name",
    "email",
    "rank",
    "total_points",
    "total_predictions",
    "exact_count",
    "correct_count",
    "goal_diff_sum",
  ];

  // Per-match: 8 columns. M{n}_{date}_{HOME}_{AWAY}_{suffix}
  matches.forEach((m, i) => {
    const idx = i + 1;
    const base = `M${idx}_${fmtDate(m.match_date)}_${m.home_team_code}_${m.away_team_code}`;
    headerCols.push(`${base}_actual`);    // "2–1" regulation+ET score / blank
    headerCols.push(`${base}_pred`);      // "2–1" predicted open-play score / blank
    headerCols.push(`${base}_pts`);       // total points 0–5 (incl. shootout bonus) / blank
    headerCols.push(`${base}_kickoff`);   // ISO 8601 kickoff for reference
    // Match duration + shootout columns. duration is FD's enum
    // (REGULAR / EXTRA_TIME / PENALTY_SHOOTOUT), blank for unplayed.
    // _pens = actual shootout score, _pred_pens = the user's predicted
    // shootout score (only set for a drawn KO prediction), _pen_bonus =
    // the shootout-bonus points (0–2) earned on this match — blank unless
    // the match went to pens.
    headerCols.push(`${base}_duration`);
    headerCols.push(`${base}_pens`);
    headerCols.push(`${base}_pred_pens`);
    headerCols.push(`${base}_pen_bonus`);
  });

  // Per built-in boost: 3 columns. boost_{slug}_{suffix}
  boosts.forEach((b) => {
    headerCols.push(`boost_${b.slug}_pred`);
    headerCols.push(`boost_${b.slug}_actual`);
    headerCols.push(`boost_${b.slug}_pts`);
  });

  // Per custom boost: 3 columns. custom_{slug}_{suffix} — slug
  // synthesised from the boost title (see above) since the table has
  // no slug column.
  customBoosts.forEach((_b, i) => {
    const s = customSlugs[i]!;
    headerCols.push(`custom_${s}_pred`);
    headerCols.push(`custom_${s}_actual`);
    headerCols.push(`custom_${s}_pts`);
  });

  // ─── data rows ──────────────────────────────────────────────────────────
  const lines: string[] = [];
  lines.push(headerCols.map(csvCell).join(","));

  for (const u of sortedUsers) {
    const row: (string | number)[] = [];
    row.push(u.user_id);
    row.push(u.display_name ?? "");
    row.push(u.email ?? "");
    row.push(u.rank ?? 0);
    row.push(u.total_points);
    row.push(u.match_pred_count);
    row.push(u.exact_count);
    row.push(u.correct_count);
    row.push(u.goal_diff_sum);

    for (const m of matches) {
      const p = matchPredsByKey.get(`${u.user_id}::${m.match_id}`);
      const s = p ? scoreMatch(p, m) : null;
      const wentToPens =
        m.duration === "PENALTY_SHOOTOUT" &&
        m.penalty_home_score !== null &&
        m.penalty_away_score !== null;
      row.push(fmtScore(m.home_score, m.away_score));           // _actual
      row.push(p ? fmtScore(p.home_score, p.away_score) : "");  // _pred
      row.push(s ? s.pts : "");                                 // _pts
      row.push(fmtKickoff(m.match_date));                       // _kickoff
      // Duration is FD's enum verbatim — easy to filter on in Excel/Sheets.
      row.push(m.duration ?? "");                               // _duration
      row.push(fmtScore(m.penalty_home_score, m.penalty_away_score)); // _pens (actual)
      row.push(p ? fmtScore(p.penalty_home_score, p.penalty_away_score) : ""); // _pred_pens
      // Shootout bonus is only meaningful once a match has gone to pens;
      // blank elsewhere (vs 0 = "went to pens but earned no bonus").
      row.push(s && wentToPens ? s.penaltyBonus : "");          // _pen_bonus
    }

    for (const b of boosts) {
      const result = boostResults.get(b.id);
      const actualStr =
        b.prediction_type === "team"
          ? result?.result_team_code ?? ""
          : result?.result_player_name ?? "";
      const p = boostPredsByKey.get(`${u.user_id}::${b.id}`);
      const predStr = p
        ? b.prediction_type === "team"
          ? p.predicted_team_code ?? ""
          : p.predicted_player_name ?? ""
        : "";
      const pts = p ? boostPoints(p, result, b.points_value, b.prediction_type) : "";
      row.push(predStr);
      row.push(actualStr);
      row.push(pts);
    }

    for (const cb of customBoosts) {
      const result = customResults.get(cb.id);
      const actualStr =
        cb.prediction_type === "team"
          ? result?.result_team_code ?? ""
          : result?.result_player_name ?? "";
      const p = customPredsByKey.get(`${u.user_id}::${cb.id}`);
      const predStr = p
        ? cb.prediction_type === "team"
          ? p.predicted_team_code ?? ""
          : p.predicted_player_name ?? ""
        : "";
      const pts = p ? boostPoints(p, result, cb.points_value, cb.prediction_type) : "";
      row.push(predStr);
      row.push(actualStr);
      row.push(pts);
    }

    lines.push(row.map(csvCell).join(","));
  }

  // U+FEFF BOM — Excel detects UTF-8 reliably with this prefix. Some
  // locales (Cyrillic / accented Latin) otherwise garble the column
  // headers and display names on file-open.
  return "﻿" + lines.join("\n") + "\n";
}
