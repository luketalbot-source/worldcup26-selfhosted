// Shared utility for flag URLs

// Map team codes to ISO 2-letter country codes for flag images
export const teamCodeToCountryCode: Record<string, string> = {
  // Group A
  'MEX': 'mx', 'RSA': 'za', 'KOR': 'kr', 'DEN': 'dk',
  // Group B
  'CAN': 'ca', 'ITA': 'it', 'QAT': 'qa', 'SUI': 'ch',
  // Group C
  'BRA': 'br', 'MAR': 'ma', 'HAI': 'ht', 'SCO': 'gb-sct',
  // Group D
  'USA': 'us', 'PAR': 'py', 'AUS': 'au', 'TUR': 'tr',
  // Group E
  'GER': 'de', 'CUW': 'cw', 'CIV': 'ci', 'ECU': 'ec',
  // Group F
  'NED': 'nl', 'JPN': 'jp', 'UKR': 'ua', 'TUN': 'tn',
  // Group G
  'BEL': 'be', 'EGY': 'eg', 'IRN': 'ir', 'NZL': 'nz',
  // Group H
  'ESP': 'es', 'CPV': 'cv', 'KSA': 'sa', 'URU': 'uy',
  // Group I
  'FRA': 'fr', 'SEN': 'sn', 'BOL': 'bo', 'NOR': 'no',
  // Group J
  'ARG': 'ar', 'ALG': 'dz', 'AUT': 'at', 'JOR': 'jo',
  // Group K
  'POR': 'pt', 'JAM': 'jm', 'UZB': 'uz', 'COL': 'co',
  // Group L
  'ENG': 'gb-eng', 'CRO': 'hr', 'GHA': 'gh', 'PAN': 'pa',
  // Legacy codes (keeping for backwards compatibility)
  'NGA': 'ng', 'ALB': 'al', 'IDN': 'id', 'UAE': 'ae',
  'CHN': 'cn', 'MKD': 'mk', 'CRC': 'cr', 'BFA': 'bf',
  'SLO': 'sk', 'CMR': 'cm', 'SRB': 'rs', 'WAL': 'gb-wls',
};

export const getFlagUrl = (teamCode: string): string | null => {
  if (!teamCode || teamCode === 'TBD') return null;
  const countryCode = teamCodeToCountryCode[teamCode];
  if (!countryCode) return null;
  return `https://flagcdn.com/w640/${countryCode}.png`;
};
