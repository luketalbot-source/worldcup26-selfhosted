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

export const getFlagUrl = (teamCode: string): string | null => {
  if (!teamCode || teamCode === 'TBD') return null;
  const code = teamCode.toUpperCase();
  const override = FLAGCDN_OVERRIDES[code];
  if (override) return `https://flagcdn.com/w640/${override}.png`;
  const iso2 = TLA_TO_ISO2[code];
  if (!iso2) return null;
  return `https://flagcdn.com/w640/${iso2.toLowerCase()}.png`;
};
