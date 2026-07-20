import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api } from '@/lib/apiClient';
import { useTenant } from '@/contexts/TenantContext';
import { getFormatProfile, type CompetitionFormat, type FormatProfile } from '@/lib/competitionFormats';

// Competition selection state. Fetches the tenant's ENABLED competitions
// (per-tenant feature flags via tenant_competitions — the API filters) once
// per mount, remembers the last-viewed competition per tenant, and exposes
// the active competition + its format profile to every view.
//
// A tenant with exactly one enabled competition never shows the switcher —
// the app looks exactly like the single-competition era.

export interface Competition {
  id: string;
  slug: string;
  fd_code: string;
  fd_season: number | null;
  season: string;
  name: string;
  short_name: string;
  format: CompetitionFormat;
  boost_lock_at: string | null;
  is_active: boolean;
  display_order: number;
  // False = launched platform-wide but NOT enabled for this tenant — shown
  // as a muted "coming soon" teaser in the game hub, never playable.
  // Optional for back-compat with older API responses (absent = enabled).
  enabled?: boolean;
}

/** Season-qualified display label — "Bundesliga 2026/27". Use wherever a
 *  game is referenced outside its own context (league scope badges, scope
 *  pickers), so this season's and next season's games stay distinguishable
 *  as history accumulates. */
export const competitionLabel = (comp: Pick<Competition, 'short_name' | 'season'>): string =>
  `${comp.short_name} ${comp.season}`;

export const isEnabled = (comp: Competition): boolean => comp.enabled !== false;

interface CompetitionContextValue {
  competitions: Competition[];
  activeCompetition: Competition | null;
  setActiveCompetition: (id: string) => void;
  /** Return to the game hub (multi-competition tenants only). */
  clearActiveCompetition: () => void;
  /** Format profile for the active competition (tournament profile fallback). */
  profile: FormatProfile;
  loading: boolean;
}

const CompetitionContext = createContext<CompetitionContextValue | undefined>(undefined);

const storageKey = (tenantUid: string) => `competition.active.${tenantUid}`;

// Deploy-skew / legacy-API fallback: if GET /api/competitions fails (old
// API still live during a rolling deploy, or a transient error), behave
// exactly like the single-competition era by synthesizing the WC archive
// row. Matches the Phase A seed (fixed uuid + slug) so all downstream
// fetches resolve. NOT used for a legitimate empty list — a tenant with
// zero enabled competitions genuinely sees nothing.
const WC_FALLBACK: Competition = {
  id: 'a0000000-0000-4000-8000-000000000001',
  slug: 'wc-2026',
  fd_code: 'WC',
  fd_season: 2026,
  season: '2026',
  name: 'FIFA World Cup 2026',
  short_name: 'World Cup 2026',
  format: 'tournament',
  boost_lock_at: null,
  is_active: false,
  display_order: 1,
};

export const CompetitionProvider = ({ children }: { children: ReactNode }) => {
  const { tenant } = useTenant();
  const [competitions, setCompetitions] = useState<Competition[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!tenant?.id) return;
      try {
        const rows = await api.get<Competition[]>(`/competitions?tenant_id=${tenant.id}`);
        if (cancelled) return;
        setCompetitions(rows);
        const playable = rows.filter(isEnabled);
        if (rows.length > 1) {
          // Multiple games (playable or coming-soon teasers): greet the
          // user with the game hub (active id stays null) — they pick a
          // card, and teasers advertise what could be unlocked.
          setActiveId(null);
        } else {
          // Exactly one game and nothing to tease: skip the hub entirely —
          // the app looks and behaves like the single-competition era.
          setActiveId(playable[0]?.id ?? null);
        }
      } catch (err) {
        console.error('[competitions] load failed — falling back to WC archive:', err);
        if (!cancelled) {
          setCompetitions([WC_FALLBACK]);
          setActiveId(WC_FALLBACK.id);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [tenant?.id, tenant?.uid]);

  const setActiveCompetition = (id: string) => {
    // Teasers are display-only — entering one is a no-op.
    const target = competitions.find((c) => c.id === id);
    if (target && !isEnabled(target)) return;
    setActiveId(id);
    if (tenant?.uid) localStorage.setItem(storageKey(tenant.uid), id);
  };

  const clearActiveCompetition = () => setActiveId(null);

  const value = useMemo<CompetitionContextValue>(() => {
    const active = competitions.find((c) => c.id === activeId) ?? null;
    return {
      competitions,
      activeCompetition: active,
      setActiveCompetition,
      clearActiveCompetition,
      profile: getFormatProfile(active?.format ?? 'tournament'),
      loading,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [competitions, activeId, loading, tenant?.uid]);

  return <CompetitionContext.Provider value={value}>{children}</CompetitionContext.Provider>;
};

export const useCompetitions = (): CompetitionContextValue => {
  const ctx = useContext(CompetitionContext);
  if (!ctx) throw new Error('useCompetitions must be used within CompetitionProvider');
  return ctx;
};

/** Tolerant variant for hooks/components that can render outside the
 *  provider (admin surfaces). Returns null there instead of throwing —
 *  callers fall back to tournament/country behavior. */
export const useCompetitionsSafe = (): CompetitionContextValue | null => {
  return useContext(CompetitionContext) ?? null;
};
