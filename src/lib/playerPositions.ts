// FD position string → stable i18n key map.
//
// football-data.org returns positions in two flavours that we both
// have rows for in live_players:
//   - 2-letter codes (GK / DF / MF / FW): legacy values from when FD's
//     own taxonomy was simpler — they get pushed through our import
//     un-normalised (see api/src/routes/players.ts).
//   - Granular labels ("Centre-Back", "Defensive Midfield", "Left
//     Winger", …): the modern FD shape; passed through verbatim
//     because there are too many to compress to 2 letters without
//     losing tactical info.
//
// Either form needs a German / Spanish / French / … rendering for
// the picker, so this map centralises the key lookup. Locale files
// then carry the actual translations under `positions.*`.
//
// Unknown positions fall through to the raw string — never crash,
// never blank the picker, just show the English label.

import type { TFunction } from 'i18next';

const POSITION_KEY_MAP: Record<string, string> = {
  // 2-letter legacy codes — the ones that landed in the DB during the
  // first /admin/players/sync-from-fd run when FD still mapped to
  // these via our normalisePosition() helper.
  GK: 'goalkeeper',
  DF: 'defender',
  MF: 'midfielder',
  FW: 'forward',

  // Granular labels currently returned by FD's /competitions/WC/teams
  // endpoint. Order doesn't matter — Object.keys lookup is O(1).
  Goalkeeper: 'goalkeeper',

  'Centre-Back': 'centreBack',
  'Left-Back': 'leftBack',
  'Right-Back': 'rightBack',
  Defence: 'defender',

  'Defensive Midfield': 'defensiveMidfield',
  'Central Midfield': 'centralMidfield',
  'Attacking Midfield': 'attackingMidfield',
  Midfield: 'midfielder',

  'Left Winger': 'leftWinger',
  'Right Winger': 'rightWinger',
  'Centre-Forward': 'centreForward',
  'Second Striker': 'secondStriker',
  Offence: 'forward',
};

/**
 * Translate an FD position string via the active i18n bundle. Returns
 * the raw value when no key mapping or no translation exists, so the
 * picker always shows _something_ — never a blank field or an i18n key.
 */
export function translatePlayerPosition(
  raw: string | null | undefined,
  t: TFunction,
): string | null {
  if (!raw) return null;
  const key = POSITION_KEY_MAP[raw];
  if (!key) return raw;
  return t(`positions.${key}`, { defaultValue: raw });
}
