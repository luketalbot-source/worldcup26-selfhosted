// Team name translations helper
// Maps team codes to translation keys

export const getTeamTranslationKey = (teamCode: string): string => {
  return `teams.${teamCode}`;
};

// Fallback team names (English) for teams that might not be in translations
export const fallbackTeamNames: Record<string, string> = {
  // Group A
  'MEX': 'Mexico',
  'RSA': 'South Africa',
  'KOR': 'South Korea',
  'TBD': 'TBD',
  // Group B
  'CAN': 'Canada',
  'QAT': 'Qatar',
  'SUI': 'Switzerland',
  // Group C
  'BRA': 'Brazil',
  'MAR': 'Morocco',
  'HAI': 'Haiti',
  'SCO': 'Scotland',
  // Group D
  'USA': 'United States',
  'PAR': 'Paraguay',
  'AUS': 'Australia',
  // Group E
  'GER': 'Germany',
  'CUW': 'Curaçao',
  'CIV': 'Ivory Coast',
  'ECU': 'Ecuador',
  // Group F
  'NED': 'Netherlands',
  'JPN': 'Japan',
  'TUN': 'Tunisia',
  // Group G
  'BEL': 'Belgium',
  'EGY': 'Egypt',
  'IRN': 'Iran',
  'NZL': 'New Zealand',
  // Group H
  'ESP': 'Spain',
  'CPV': 'Cape Verde',
  'KSA': 'Saudi Arabia',
  'URU': 'Uruguay',
  // Group I
  'FRA': 'France',
  'SEN': 'Senegal',
  'NOR': 'Norway',
  // Group J
  'ARG': 'Argentina',
  'ALG': 'Algeria',
  'AUT': 'Austria',
  'JOR': 'Jordan',
  // Group K
  'POR': 'Portugal',
  'UZB': 'Uzbekistan',
  'COL': 'Colombia',
  // Group L
  'ENG': 'England',
  'CRO': 'Croatia',
  'GHA': 'Ghana',
  'PAN': 'Panama',
  // Legacy/Additional
  'ITA': 'Italy',
  'DEN': 'Denmark',
  'TUR': 'Turkey',
  'UKR': 'Ukraine',
  'BOL': 'Bolivia',
  'JAM': 'Jamaica',
};
