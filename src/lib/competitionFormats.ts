// Format profiles: the static registry that tells the UI how to compose
// itself for each competition format. The WC archive routes into the exact
// code paths that existed before the multi-competition work (groups A–L +
// bracket projection); club competitions get the matchday/table composition.
//
// Two orthogonal mechanisms (don't conflate):
//   - WHICH competitions a tenant sees  → tenant_competitions flags (API)
//   - HOW a competition renders          → this format profile

export type CompetitionFormat = 'tournament' | 'league' | 'hybrid';

export type SubView = 'today' | 'matchday' | 'table' | 'groups' | 'knockout';

export interface FormatProfile {
  subViews: SubView[];
  defaultSubView: SubView;
  /** Whether teams are countries (bundled flag SVGs + teams.* i18n names)
   *  or clubs (crest_url images + API names, never translated). */
  teamKind: 'country' | 'club';
  /** Only the WC archive projects a bracket from static data. */
  usesStaticBracket: boolean;
  /** League-table zone tinting: top N qualify directly, next M to playoffs. */
  tableZones?: { direct: number; playoff?: number };
}

const PROFILES: Record<CompetitionFormat, FormatProfile> = {
  tournament: {
    subViews: ['today', 'groups', 'knockout'],
    defaultSubView: 'today',
    teamKind: 'country',
    usesStaticBracket: true,
  },
  league: {
    // Matchday-first: club football has empty "Today"s most of the week.
    subViews: ['today', 'matchday', 'table'],
    defaultSubView: 'matchday',
    teamKind: 'club',
    usesStaticBracket: false,
  },
  hybrid: {
    // Swiss-format CL: league phase (matchday 1–8, one 36-row table) then
    // playoff round + knockouts (stage-grouped list, not the WC bracket).
    subViews: ['today', 'matchday', 'table', 'knockout'],
    defaultSubView: 'matchday',
    teamKind: 'club',
    usesStaticBracket: false,
    tableZones: { direct: 8, playoff: 24 },
  },
};

export function getFormatProfile(format: CompetitionFormat): FormatProfile {
  return PROFILES[format] ?? PROFILES.tournament;
}
