// FIFA / IOC three-letter code → country-flag-icons code map.
//
// Our team codes follow FIFA's TLA convention (BRA, ENG, GER, etc.) for
// consistency with football-data.org, but `country-flag-icons` keys flags
// by ISO 3166-1 alpha-2 (BR, DE) plus a handful of subdivision codes
// (GB-ENG, GB-SCT) for UK constituent nations. This file holds the
// crosswalk so the rest of the app can just import <Flag code={team.code} />
// without thinking about either system.
//
// Codes covered: all 48 WC2026 qualifiers + a handful of legacy ones
// (ITA/DEN/UKR/BOL/JAM/CUW/URU) kept so old prediction rows resolve
// against historical IOC codes too.

export const TLA_TO_FLAG_ICONS_CODE: Record<string, string> = {
  // Africa
  ALG: 'DZ', // Algeria
  CIV: 'CI', // Côte d'Ivoire
  CPV: 'CV', // Cape Verde
  COD: 'CD', // DR Congo
  EGY: 'EG',
  GHA: 'GH',
  MAR: 'MA', // Morocco
  RSA: 'ZA', // South Africa
  SEN: 'SN',
  TUN: 'TN',

  // Asia / AFC
  AUS: 'AU',
  IRN: 'IR', // Iran
  IRQ: 'IQ',
  JOR: 'JO',
  JPN: 'JP',
  KOR: 'KR', // South Korea
  KSA: 'SA', // Saudi Arabia
  QAT: 'QA',
  UZB: 'UZ',

  // CONCACAF
  CAN: 'CA',
  HAI: 'HT', // Haiti — IOC HAI, ISO HT
  MEX: 'MX',
  PAN: 'PA',
  USA: 'US',
  CUR: 'CW', // Curaçao — FD uses CUR, ISO is CW
  CUW: 'CW', // Same country, IOC code form kept for back-compat

  // CONMEBOL
  ARG: 'AR',
  BRA: 'BR',
  COL: 'CO',
  ECU: 'EC',
  PAR: 'PY', // Paraguay
  URY: 'UY', // Uruguay — FD uses URY
  URU: 'UY', // Same country, IOC code form

  // OFC
  NZL: 'NZ',

  // UEFA
  AUT: 'AT', // Austria
  BEL: 'BE',
  BIH: 'BA', // Bosnia & Herzegovina
  CRO: 'HR', // Croatia
  CZE: 'CZ', // Czechia
  ESP: 'ES',
  FRA: 'FR',
  GER: 'DE', // Germany — IOC GER, ISO DE
  NED: 'NL', // Netherlands
  NOR: 'NO',
  POR: 'PT',
  SUI: 'CH', // Switzerland
  SWE: 'SE',
  TUR: 'TR', // Turkey

  // UK constituent nations — country-flag-icons ships GB-{ENG,SCT,WLS,NIR}.
  // Without this fallback they'd render with a generic GB flag, losing the
  // St George's / saltire identity fans expect.
  ENG: 'GB-ENG',
  SCO: 'GB-SCT',
  WAL: 'GB-WLS',

  // Legacy / additional — historical codes that may appear in old
  // predictions or admin-pasted boost results.
  ITA: 'IT',
  DEN: 'DK', // Denmark — IOC DEN, ISO DK
  UKR: 'UA',
  BOL: 'BO',
  JAM: 'JM',
};

/**
 * Resolve a team code (FIFA TLA, etc.) to the flag-icons code used by
 * the `<Flag>` component. Returns null when we have no mapping — the
 * Flag component falls back to a neutral white-flag placeholder so
 * unknown teams render without crashing.
 */
export function getFlagIconCode(teamCode: string | null | undefined): string | null {
  if (!teamCode) return null;
  return TLA_TO_FLAG_ICONS_CODE[teamCode.toUpperCase()] ?? null;
}
