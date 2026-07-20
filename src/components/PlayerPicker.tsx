// Picker for "predict a player" boost types.
//
// Replaces the free-text Input. Free-text broke scoring at result time
// because user-entered "Mbappe" never equality-matched the admin's
// "Kylian Mbappé"; here both pick from the same canonical name string
// and the equality join just works.
//
// Three discovery modes in one screen:
//   1. Type-ahead search across the full roster (fastest path for users
//      who know who they want).
//   2. Country drilldown via a grid of flag chips (matches how fans
//      think — "I want a Brazilian player").
//   3. Implicit: the selected player chip stays visible outside the
//      modal so the user always sees what they've picked.
//
// Renders inside a Dialog so it works on phone screens without a route
// change; the Dialog primitive we already use scales full-screen-on-
// mobile / centred-on-desktop out of the box.

import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Search, X, ChevronLeft, UsersRound } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useQualifiedPlayers, type Player } from '@/hooks/useQualifiedPlayers';
import { useQualifiedTeams } from '@/hooks/useQualifiedTeams';
import { useTeamName } from '@/hooks/useTeamName';
import { Flag } from '@/components/Flag';
import { useCompetitionsSafe } from '@/contexts/CompetitionContext';
import { translatePlayerPosition } from '@/lib/playerPositions';

// Mirror the normaliseForSearch on the backend — kept here so the
// typeahead can match accent-insensitively without a server round-trip
// per keystroke.
function normaliseQuery(s: string): string {
  return s
    .normalize('NFD')
    // Must match the backend's normaliseForSearch byte-for-byte —
    // U+0300..U+036F are the Unicode combining diacritical marks that
    // NFD decomposition splits accents into. Strip them so "Mbappé"
    // and "Mbappe" hash to the same searchable form.
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

interface PlayerPickerProps {
  /** Currently selected player name (canonical full_name), or '' when empty. */
  value: string;
  /** Called with the chosen player's full_name, or '' if cleared. */
  onChange: (fullName: string) => void;
  /** Disable interaction (e.g. when the boost is locked). */
  disabled?: boolean;
  /** Placeholder shown on the trigger button when no value is selected. */
  placeholder?: string;
  /** Scope the player roster to a specific competition slug. For surfaces
   *  without a CompetitionProvider (the admin boost tab) — otherwise the
   *  active competition (or unscoped) is used. */
  competitionSlug?: string;
}

export const PlayerPicker = ({
  value,
  onChange,
  disabled,
  placeholder,
  competitionSlug,
}: PlayerPickerProps) => {
  const { t } = useTranslation();
  const { players, loading } = useQualifiedPlayers(competitionSlug);
  const teams = useQualifiedTeams();
  const { getTeamName } = useTeamName();
  const teamKind = useCompetitionsSafe()?.profile.teamKind ?? 'country';

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  // null = country grid; otherwise the team_code currently drilled into.
  const [drillTeam, setDrillTeam] = useState<string | null>(null);

  // Look up the selected player so the trigger can show "Messi · ARG"
  // rather than just the bare name. Defensive against the roster
  // having been wiped/re-imported between the prediction and now.
  const selected = useMemo<Player | null>(() => {
    if (!value) return null;
    return players.find((p) => p.full_name === value) ?? null;
  }, [players, value]);

  // Search results — flat list across every team. Trimmed to top 40 so
  // the scroll list stays snappy on slow phones; if a user can't find
  // their player in the top 40 they can refine the query or drill in
  // by country.
  const searchResults = useMemo<Player[]>(() => {
    const q = normaliseQuery(query);
    if (q.length === 0) return [];
    const ranked = players
      .map((p) => {
        const idx = normaliseQuery(p.full_name).indexOf(q);
        return idx === -1 ? null : { p, score: idx };
      })
      .filter((x): x is { p: Player; score: number } => x !== null)
      // Lower score (earlier match position) wins, ties broken by name.
      .sort((a, b) => a.score - b.score || a.p.full_name.localeCompare(b.p.full_name))
      .slice(0, 40)
      .map((x) => x.p);
    return ranked;
  }, [players, query]);

  // The drill-in list: every player on the selected team, sorted by
  // shirt number first (intuitive for fans flipping through a kit
  // poster) then name as a tiebreaker.
  const drillResults = useMemo<Player[]>(() => {
    if (!drillTeam) return [];
    return players
      .filter((p) => p.team_code === drillTeam)
      .sort((a, b) => {
        const sa = a.shirt_number ?? 999;
        const sb = b.shirt_number ?? 999;
        if (sa !== sb) return sa - sb;
        return a.full_name.localeCompare(b.full_name);
      });
  }, [players, drillTeam]);

  const handlePick = (player: Player) => {
    onChange(player.full_name);
    setOpen(false);
    // Reset transient picker state so the next open starts clean.
    setQuery('');
    setDrillTeam(null);
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange('');
  };

  // Manual body-scroll-lock. Radix Dialog's react-remove-scroll worked
  // fine in standalone web but was unreliable inside Flip's mobile
  // WebView iframe — taps inside the picker either failed to scroll
  // the list (gesture routed nowhere) or scrolled the matches view
  // behind the picker. We now own the lock: position-fix the body at
  // its current scrollY while open, restore it on close. Tested
  // against the iOS WebView pattern and the standard browser case.
  const savedScrollYRef = useRef(0);
  useEffect(() => {
    if (!open) return;
    savedScrollYRef.current = window.scrollY;
    const body = document.body;
    const prev = {
      position: body.style.position,
      top: body.style.top,
      left: body.style.left,
      right: body.style.right,
      overflow: body.style.overflow,
      width: body.style.width,
    };
    body.style.position = 'fixed';
    body.style.top = `-${savedScrollYRef.current}px`;
    body.style.left = '0';
    body.style.right = '0';
    body.style.width = '100%';
    body.style.overflow = 'hidden';
    return () => {
      // Restore every property we touched, then jump back to the
      // pre-open scroll position. Without the restoration step the
      // page would snap to the top when the picker closes.
      body.style.position = prev.position;
      body.style.top = prev.top;
      body.style.left = prev.left;
      body.style.right = prev.right;
      body.style.overflow = prev.overflow;
      body.style.width = prev.width;
      window.scrollTo(0, savedScrollYRef.current);
    };
  }, [open]);

  // Close on Escape (Radix Dialog gave us this for free; we wire it
  // up manually now). Only attached while open to keep listener-count
  // off the body in the common case.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  // What to render in the trigger button. Three states:
  //   - selected & player still in roster → flag + name
  //   - selected but player no longer in roster → bare name (stale pick)
  //   - empty → placeholder
  const renderTrigger = () => {
    if (selected) {
      const team = teams.find((tm) => tm.code === selected.team_code);
      return (
        <span className="flex items-center gap-2 truncate">
          {team && <Flag code={team.code} crestUrl={team.crestUrl} kind={teamKind} className="w-4" />}
          <span className="truncate font-medium">{selected.full_name}</span>
          {selected.position && (
            <span className="text-xs text-muted-foreground">
              {translatePlayerPosition(selected.position, t)}
            </span>
          )}
        </span>
      );
    }
    if (value) {
      // We have a stored value but the matching roster row is missing —
      // show the raw name so the user can still tell what they picked
      // before the roster changed.
      return <span className="truncate text-muted-foreground">{value}</span>;
    }
    return (
      <span className="truncate text-muted-foreground">
        {placeholder ?? t('boost.selectPlayer', 'Select player')}
      </span>
    );
  };

  return (
    <>
      {/* Trigger button is a plain <Button>; opening the modal is just
          a state toggle now (no Radix-managed portal). */}
      <Button
        type="button"
        variant="outline"
        disabled={disabled}
        onClick={() => setOpen(true)}
        className="w-full justify-between font-normal"
      >
        {renderTrigger()}
        {value ? (
          <X
            role="button"
            aria-label={t('common.clear', 'Clear')}
            className="w-4 h-4 shrink-0 opacity-60 hover:opacity-100"
            onClick={handleClear}
          />
        ) : (
          <Search className="w-4 h-4 shrink-0 opacity-60" />
        )}
      </Button>

      {/* Custom modal rendered via portal at the document root.
          Bypasses Radix Dialog because Radix's react-remove-scroll
          stack was unreliable on iOS WebView inside Flip's iframe:
          either no scroll worked, or the gesture scrolled the
          matches view behind. By doing the body-lock ourselves (see
          the useEffect above) and laying out the modal with explicit
          fixed positioning (top:0 right:0 bottom:0 left:0 → flex
          column), every browser we tested honours the inner
          overflow-y-auto without surprises. */}
      {open && createPortal(
        <div className="fixed inset-0 z-50">
          {/* Backdrop — tap-to-close. Plain div instead of Radix
              Overlay, so backdrop and content live in the same
              event tree and we don't have to fight Radix's pointer-
              event handling. */}
          <div
            className="absolute inset-0 bg-black/80"
            onClick={() => setOpen(false)}
            aria-hidden="true"
          />
          {/* Content wrapper. Pinned via insets — top/bottom 8px on
              mobile, more breathing room with the responsive `sm:`
              utilities. Explicit `flex flex-col` plus `min-h-0`
              cascading children gives the inner scroller a definite
              parent height to work with, which is what flex+vh
              inside Radix Dialog kept failing to provide on iOS
              WebView. `touch-action: pan-y` declares this subtree
              as the vertical-scroll target so the browser doesn't
              route drags up to the iframe parent. */}
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="player-picker-title"
            className="absolute inset-x-2 top-2 bottom-2 sm:inset-auto sm:left-1/2 sm:top-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 sm:w-full sm:max-w-md sm:h-auto sm:max-h-[85dvh] bg-background rounded-lg shadow-lg border flex flex-col overflow-hidden"
            style={{ touchAction: 'pan-y' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 border-b shrink-0 flex items-center justify-between gap-2">
              <h2 id="player-picker-title" className="text-base flex items-center gap-2 font-semibold">
                {drillTeam ? (
                  <>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => setDrillTeam(null)}
                      className="h-8 w-8 -ml-2"
                      aria-label={t('common.back', 'Back')}
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </Button>
                    <span className="inline-flex items-center gap-1.5">
                      <Flag
                        code={drillTeam}
                        crestUrl={teams.find((tm) => tm.code === drillTeam)?.crestUrl}
                        kind={teamKind}
                        className="w-4"
                      />
                      {getTeamName(
                        drillTeam,
                        teams.find((tm) => tm.code === drillTeam)?.name,
                      )}
                    </span>
                  </>
                ) : (
                  <>
                    <UsersRound className="w-4 h-4" />
                    {t('boost.pickPlayer', 'Pick a player')}
                  </>
                )}
              </h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label={t('common.close', 'Close')}
                className="p-1 rounded hover:bg-muted text-muted-foreground"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {!drillTeam && (
              <div className="p-3 border-b shrink-0">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                  <Input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder={t('boost.searchPlayers', 'Search players…')}
                    className="pl-9"
                    autoFocus
                  />
                </div>
              </div>
            )}

            {/* Native scrolling div, with explicit `touch-action: pan-y`
                so iOS WebView doesn't punt drags up to the parent
                iframe. `min-h-0` is critical — without it the flex
                child can refuse to shrink and the overflow never
                triggers. */}
            <div
              className="flex-1 min-h-0 overflow-y-auto overscroll-contain"
              style={{ WebkitOverflowScrolling: 'touch', touchAction: 'pan-y' }}
            >
              {loading ? (
                <div className="p-6 text-sm text-center text-muted-foreground">
                  {t('common.loading', 'Loading…')}
                </div>
              ) : players.length === 0 ? (
                <div className="p-6 text-sm text-center text-muted-foreground">
                  {t(
                    'boost.noPlayersLoaded',
                    'No player rosters loaded yet. Ask the admin to import squads.',
                  )}
                </div>
              ) : drillTeam ? (
                <PlayerList items={drillResults} onPick={handlePick} teams={teams} />
              ) : query ? (
                searchResults.length === 0 ? (
                  <div className="p-6 text-sm text-center text-muted-foreground">
                    {t('boost.noPlayerMatches', 'No matches for')} "{query}"
                  </div>
                ) : (
                  <PlayerList items={searchResults} onPick={handlePick} teams={teams} />
                )
              ) : (
                <CountryGrid teams={teams} onPick={(code) => setDrillTeam(code)} />
              )}
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
};

// ----- subcomponents kept in the same file because they aren't reused elsewhere -----

interface CountryGridProps {
  teams: ReturnType<typeof useQualifiedTeams>;
  onPick: (teamCode: string) => void;
}

const CountryGrid = ({ teams, onPick }: CountryGridProps) => {
  const { getTeamName } = useTeamName();
  const teamKind = useCompetitionsSafe()?.profile.teamKind ?? 'country';
  return (
    <div className="grid grid-cols-2 gap-2 p-3">
      {teams.map((tm) => (
        <button
          key={tm.code}
          type="button"
          onClick={() => onPick(tm.code)}
          className="flex items-center gap-2 px-3 py-2.5 rounded-lg border border-border hover:bg-muted text-left transition-colors"
        >
          <Flag code={tm.code} crestUrl={tm.crestUrl} kind={teamKind} className="w-5 shrink-0" />
          <span className="text-sm truncate">{getTeamName(tm.code, tm.name)}</span>
        </button>
      ))}
    </div>
  );
};

interface PlayerListProps {
  items: Player[];
  onPick: (p: Player) => void;
  teams: ReturnType<typeof useQualifiedTeams>;
}

const PlayerList = ({ items, onPick, teams }: PlayerListProps) => {
  const { t } = useTranslation();
  const { getTeamName } = useTeamName();
  const teamKind = useCompetitionsSafe()?.profile.teamKind ?? 'country';
  return (
    <div className="divide-y divide-border">
      {items.map((p) => {
        const team = teams.find((tm) => tm.code === p.team_code);
        // Use the i18n-aware team name + position so this list reads
        // natively in the active locale ("Belgien · Rechtsaußen", not
        // "Belgium · Right Winger"). Country and position both fall
        // back to their raw value if no translation exists.
        const countryLabel = getTeamName(p.team_code, team?.name);
        const positionLabel = translatePlayerPosition(p.position, t);
        return (
          <button
            key={p.id}
            type="button"
            onClick={() => onPick(p)}
            className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted text-left transition-colors"
          >
            <Flag code={p.team_code} crestUrl={team?.crestUrl} kind={teamKind} className="w-5 shrink-0" />
            <span className="text-xs text-muted-foreground w-6 tabular-nums shrink-0">
              {p.shirt_number ? `#${p.shirt_number}` : ''}
            </span>
            <span className="flex-1 min-w-0">
              <span className="block text-sm font-medium truncate">{p.full_name}</span>
              <span className="block text-xs text-muted-foreground truncate">
                {countryLabel}
                {positionLabel ? ` · ${positionLabel}` : ''}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
};
