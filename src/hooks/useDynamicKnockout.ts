import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useLiveMatches } from './useLiveMatches';
import { Match, GroupStanding } from '@/types/match';
import { KnockoutMatch } from '@/data/knockoutMatches';
import { groupStageMatches } from '@/data/matches';
import {
  calculateGroupStandings,
  getQualifiedTeams,
  populateKnockoutMatches,
  getKnockoutMatchResult,
  QualifiedTeams
} from '@/lib/knockoutCalculator';

// FD status → UI status. Same logic as in useLiveMatches but local to this
// hook so we don't re-import an internal helper.
function mapApiStatus(apiStatus: string): 'upcoming' | 'live' | 'finished' {
  switch (apiStatus) {
    case 'FINISHED':
      return 'finished';
    case 'IN_PLAY':
    case 'PAUSED':
    case 'LIVE':
      return 'live';
    default:
      return 'upcoming';
  }
}

// Knockout stage → i18n round-label key (same keys the KO tabs use). Used as
// the bracketPosition badge on KO fixtures sourced directly from live_matches.
const KO_STAGE_LABEL: Record<string, string> = {
  round32: 'knockout.round32',
  round16: 'knockout.round16',
  quarter: 'knockout.quarter',
  semi: 'knockout.semi',
  third: 'knockout.thirdPlace',
  final: 'knockout.theFinal',
};

export const useDynamicKnockout = () => {
  const { t } = useTranslation();
  const { liveMatches, loading, getGroupMatches } = useLiveMatches();

  // Calculate all group standings
  const allGroupStandings = useMemo(() => {
    const groups = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'];
    const standings: Record<string, GroupStanding[]> = {};

    for (const group of groups) {
      const groupMatches = getGroupMatches(group);
      standings[group] = calculateGroupStandings(groupMatches, group);
    }

    return standings;
  }, [getGroupMatches]);

  // Get qualified teams from group stage
  const qualifiedTeams = useMemo(() => {
    return getQualifiedTeams(allGroupStandings);
  }, [allGroupStandings]);

  // Build knockout results from finished knockout matches
  const knockoutResults = useMemo(() => {
    const results: Record<string, { winner?: any; loser?: any }> = {};
    
    // Get knockout matches from live data
    const knockoutMatches = liveMatches.filter(m => 
      m.stage !== 'group' && m.status === 'FINISHED'
    );

    for (const match of knockoutMatches) {
      if (match.home_score !== null && match.away_score !== null) {
        const homeTeam = {
          id: match.home_team_code.toLowerCase(),
          name: match.home_team_name,
          code: match.home_team_code,
          flag: '🏳️',
          group: '',
        };
        const awayTeam = {
          id: match.away_team_code.toLowerCase(),
          name: match.away_team_name,
          code: match.away_team_code,
          flag: '🏳️',
          group: '',
        };

        if (match.home_score > match.away_score) {
          results[match.match_id] = { winner: homeTeam, loser: awayTeam };
        } else if (match.away_score > match.home_score) {
          results[match.match_id] = { winner: awayTeam, loser: homeTeam };
        }
      }
    }

    return results;
  }, [liveMatches]);

  // Populate knockout matches with actual teams
  const knockoutBracket = useMemo(() => {
    return populateKnockoutMatches(qualifiedTeams, knockoutResults);
  }, [qualifiedTeams, knockoutResults]);

  // Merge in-play live data (scores, status, real team codes/names) onto
  // each populated bracket entry. Without this, the KO view shows only the
  // static fixture data — so admin overrides and FD live scores never
  // appeared during a knockout match.
  //
  // Match strategy, in priority order:
  //   1. Bracket id `M{n}` → live row with `api_match_id = n` (FD's stable
  //      match number — works as soon as FD publishes the bracket).
  //   2. Both team codes match (after the draw, when bracket positions
  //      have been resolved to real teams).
  // The first wins because it survives team-code mismatches and admin
  // edits to the bracket.
  const mergeLiveOntoBracket = useMemo(() => {
    return (matches: KnockoutMatch[]): KnockoutMatch[] => matches.map((m) => {
      const apiNumber =
        typeof m.id === 'string' && /^M\d+$/.test(m.id) ? Number(m.id.slice(1)) : NaN;

      const live =
        liveMatches.find(
          (lm) => lm.stage !== 'group' && lm.api_match_id === apiNumber,
        ) ??
        liveMatches.find(
          (lm) =>
            lm.stage !== 'group' &&
            lm.home_team_code === m.homeTeam.code &&
            lm.away_team_code === m.awayTeam.code,
        );

      if (!live) return m;

      return {
        ...m,
        // Surface live team metadata once the bracket resolves (e.g. R32
        // populated with real team codes after group stage finishes).
        homeTeam: {
          ...m.homeTeam,
          name: live.home_team_name || m.homeTeam.name,
          code: live.home_team_code || m.homeTeam.code,
        },
        awayTeam: {
          ...m.awayTeam,
          name: live.away_team_name || m.awayTeam.name,
          code: live.away_team_code || m.awayTeam.code,
        },
        homeScore: live.home_score ?? m.homeScore,
        awayScore: live.away_score ?? m.awayScore,
        // PSO + duration only apply to knockout — group hooks skip
        // these fields. Undefined for unplayed / regulation finishes
        // so the badge code can early-return cleanly.
        penaltyHomeScore: live.penalty_home_score ?? undefined,
        penaltyAwayScore: live.penalty_away_score ?? undefined,
        duration: live.duration ?? undefined,
        status: mapApiStatus(live.status),
      };
    });
  }, [liveMatches]);

  // Once football-data.org publishes a round's real fixtures, they land in
  // live_matches with actual team codes — that's the source of truth and it
  // sidesteps the client-side projection entirely (whose bracket-slot↔FD
  // join can't work: FD's api_match_id is its own 6-digit id, not the
  // M73-style bracket number). Build KnockoutMatch rows straight from the
  // live data for any stage whose fixtures have resolved to real teams;
  // return [] otherwise so the caller falls back to the projection (R16+
  // stay "W M73"-style placeholders until their feeder results come in).
  const liveKnockoutByStage = useMemo(() => (stage: string): KnockoutMatch[] => {
    const rows = liveMatches.filter((lm) => lm.stage === stage);
    const hasRealTeams = rows.some(
      (r) =>
        r.home_team_code && r.home_team_code !== 'TBD' &&
        r.away_team_code && r.away_team_code !== 'TBD',
    );
    if (!hasRealTeams) return [];
    const label = KO_STAGE_LABEL[stage] ? t(KO_STAGE_LABEL[stage]) : '';
    return rows
      .slice()
      .sort((a, b) => new Date(a.match_date).getTime() - new Date(b.match_date).getTime())
      .map((lm) => ({
        id: lm.match_id,
        homeTeam: {
          id: (lm.home_team_code || 'tbd').toLowerCase(),
          name: lm.home_team_name,
          code: lm.home_team_code,
          flag: '🏳️',
          group: '',
        },
        awayTeam: {
          id: (lm.away_team_code || 'tbd').toLowerCase(),
          name: lm.away_team_name,
          code: lm.away_team_code,
          flag: '🏳️',
          group: '',
        },
        date: lm.match_date,
        time: '',
        dateIso: lm.match_date,
        venue: lm.venue ?? '',
        city: lm.city ?? '',
        stage: stage as KnockoutMatch['stage'],
        status: mapApiStatus(lm.status),
        homeScore: lm.home_score ?? undefined,
        awayScore: lm.away_score ?? undefined,
        penaltyHomeScore: lm.penalty_home_score ?? undefined,
        penaltyAwayScore: lm.penalty_away_score ?? undefined,
        duration: lm.duration ?? undefined,
        goals: lm.goals ?? [],
        bookings: lm.bookings ?? [],
        bracketPosition: label,
      }));
  }, [liveMatches, t]);

  // Get matches by knockout stage. Prefer the resolved live fixtures; fall
  // back to the projected bracket (with live scores merged) for rounds FD
  // hasn't filled with real teams yet.
  const getKnockoutStageMatches = (stage: string): KnockoutMatch[] => {
    const live = liveKnockoutByStage(stage);
    if (live.length > 0) return live;
    switch (stage) {
      case 'round32':
        return mergeLiveOntoBracket(knockoutBracket.round32);
      case 'round16':
        return mergeLiveOntoBracket(knockoutBracket.round16);
      case 'quarter':
        return mergeLiveOntoBracket(knockoutBracket.quarterFinals);
      case 'semi':
        return mergeLiveOntoBracket(knockoutBracket.semiFinals);
      case 'third':
        return mergeLiveOntoBracket([knockoutBracket.thirdPlace]);
      case 'final':
        return mergeLiveOntoBracket([knockoutBracket.final]);
      default:
        return [];
    }
  };

  // Group stage complete ⟺ every group-stage fixture in the live data has
  // finished. Authoritative (FD status) and robust — the earlier check ran
  // off client-side standings derived from a static fixture merge, which
  // under-counted (showed "6/12 groups decided") whenever a group's static
  // rows didn't line up with the live ones.
  const areGroupStagesComplete = useMemo(() => {
    const groupRows = liveMatches.filter((m) => m.stage === 'group');
    return groupRows.length > 0 && groupRows.every((m) => m.status === 'FINISHED');
  }, [liveMatches]);

  // Get summary of qualification status
  const qualificationSummary = useMemo(() => {
    const groups = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'];
    const qualified: string[] = [];
    const pending: string[] = [];

    for (const group of groups) {
      if (qualifiedTeams.groupWinners[group]) {
        qualified.push(`Group ${group}`);
      } else {
        pending.push(`Group ${group}`);
      }
    }

    return { qualified, pending, total: groups.length };
  }, [qualifiedTeams]);

  return {
    loading,
    allGroupStandings,
    qualifiedTeams,
    knockoutBracket,
    getKnockoutStageMatches,
    areGroupStagesComplete,
    qualificationSummary,
  };
};
