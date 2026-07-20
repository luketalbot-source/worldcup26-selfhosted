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
}

interface CompetitionContextValue {
  competitions: Competition[];
  activeCompetition: Competition | null;
  setActiveCompetition: (id: string) => void;
  /** Format profile for the active competition (tournament profile fallback). */
  profile: FormatProfile;
  loading: boolean;
}

const CompetitionContext = createContext<CompetitionContextValue | undefined>(undefined);

const storageKey = (tenantUid: string) => `competition.active.${tenantUid}`;

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
        // Restore last-viewed if it's still enabled; else first ACTIVE
        // competition; else first (archive-only tenants see the archive).
        const remembered = localStorage.getItem(storageKey(tenant.uid));
        const rememberedOk = rows.find((r) => r.id === remembered);
        const firstActive = rows.find((r) => r.is_active);
        setActiveId((rememberedOk ?? firstActive ?? rows[0])?.id ?? null);
      } catch (err) {
        console.error('[competitions] load failed:', err);
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
    setActiveId(id);
    if (tenant?.uid) localStorage.setItem(storageKey(tenant.uid), id);
  };

  const value = useMemo<CompetitionContextValue>(() => {
    const active = competitions.find((c) => c.id === activeId) ?? null;
    return {
      competitions,
      activeCompetition: active,
      setActiveCompetition,
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
