// Mechanical bridge between team data and the <Flag> component's club/crest
// props, so call sites don't each re-derive the kind. The kind comes from
// the ACTIVE COMPETITION's format profile — never from the team code, which
// is ambiguous (FD's TLA for FC Porto is 'POR' = Portugal's country code).

import type { FormatProfile } from '@/lib/competitionFormats';

export interface TeamVisualSource {
  code?: string | null;
  tla?: string | null;
  crestUrl?: string | null;
  crest_url?: string | null;
}

export function teamVisualProps(
  team: TeamVisualSource | null | undefined,
  profile: Pick<FormatProfile, 'teamKind'>,
): { code: string | null; crestUrl: string | null; kind: 'country' | 'club' } {
  return {
    code: team?.code ?? team?.tla ?? null,
    crestUrl: team?.crestUrl ?? team?.crest_url ?? null,
    kind: profile.teamKind,
  };
}
