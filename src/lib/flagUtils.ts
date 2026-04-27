// Flag URL helper — produces a flagcdn.com image URL from a FIFA TLA.
// Shares the same TLA → ISO2 table as useTeams.tlaToFlag so emoji + image
// flags stay aligned for new countries (CZE, BIH, CUR, SWE, IRQ, COD, etc.).

import { TLA_TO_ISO2 } from '@/hooks/useTeams';

// Home-nation overrides flagcdn.com exposes as special codes.
// (ISO-2 doesn't distinguish England/Scotland/Wales/NI — all are "GB".)
const FLAGCDN_OVERRIDES: Record<string, string> = {
  ENG: 'gb-eng',
  SCO: 'gb-sct',
  WAL: 'gb-wls',
  NIR: 'gb-nir',
};

// w160 is plenty for the small backdrop we render at <50% opacity behind
// each MatchCard half. w640 was 7-10x larger for no visible quality gain —
// dropped it because the matches view loads ~12 flags at once and bandwidth
// dominated initial render time.
const FLAGCDN_SIZE = 'w160';

export const getFlagUrl = (teamCode: string): string | null => {
  if (!teamCode || teamCode === 'TBD') return null;
  const code = teamCode.toUpperCase();
  const override = FLAGCDN_OVERRIDES[code];
  if (override) return `https://flagcdn.com/${FLAGCDN_SIZE}/${override}.png`;
  const iso2 = TLA_TO_ISO2[code];
  if (!iso2) return null;
  return `https://flagcdn.com/${FLAGCDN_SIZE}/${iso2.toLowerCase()}.png`;
};
