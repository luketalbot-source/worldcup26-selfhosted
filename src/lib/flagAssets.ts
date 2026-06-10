// Self-hosted flag images. The detailed w320 PNGs that used to come from
// flagcdn.com are vendored into public/flags/ (fetched once at build
// time, ~470 KB for all 112), so they're served from OUR origin:
//   - no third-party CDN for corporate proxies / kiosk WebViews to block
//   - same Wikipedia-quality artwork the cards always had (the bundled
//     country-flag-icons SVGs are simplified shapes — fine at 20px in
//     pickers, visibly flat at half-card size for ornate flags like
//     Spain or Mexico)
//
// Consumers should still render <Flag cover> behind the <img> (see
// CardFlagBackground in components/Flag.tsx) so something is always
// painted while the PNG streams in.

import { TLA_TO_ISO2 } from '@/hooks/useTeams';

// ISO-2 doesn't distinguish the UK home nations — flagcdn (and our
// vendored copies) expose them under special codes.
const HOME_NATION_OVERRIDES: Record<string, string> = {
  ENG: 'gb-eng',
  SCO: 'gb-sct',
  WAL: 'gb-wls',
  NIR: 'gb-nir',
};

export const getLocalFlagUrl = (teamCode: string): string | null => {
  if (!teamCode || teamCode === 'TBD') return null;
  const code = teamCode.toUpperCase();
  const override = HOME_NATION_OVERRIDES[code];
  if (override) return `/flags/${override}.png`;
  const iso2 = TLA_TO_ISO2[code];
  if (!iso2) return null;
  return `/flags/${iso2.toLowerCase()}.png`;
};
