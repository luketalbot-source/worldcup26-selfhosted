// Player name normalisation, kept in one place so the import path
// (admin runSync writing into live_players.searchable) and the read path
// (the typeahead in the picker which normalises a user's query) ALWAYS
// agree byte-for-byte. Any drift between the two breaks search silently
// — "Mbappé" stops finding "Mbappé".

/**
 * Lowercased, accent-stripped, trimmed form of a string. Used as
 * `live_players.searchable` on writes and as the query key on reads.
 *
 * U+0300..U+036F is the Unicode "combining diacritical marks" block;
 * NFD decomposes "é" → "e" + that codepoint, then we drop the mark.
 */
export function normaliseForSearch(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}
