import { useTranslation } from 'react-i18next';
import { fallbackTeamNames } from '@/lib/teamTranslations';
import { useCompetitionsSafe } from '@/contexts/CompetitionContext';

/**
 * Hook to get translated team names.
 *
 * Countries translate through the teams.* i18n keys (54 country names ×14
 * locales). CLUBS never do: FD's club TLAs collide with country codes
 * (Porto = 'POR' = Portugal), so a club competition would otherwise show
 * "Portugal" for Porto in every locale. Club names come from the API
 * verbatim — club names aren't translated anyway.
 */
export const useTeamName = () => {
  const { t } = useTranslation();
  // Tolerant: outside CompetitionProvider (admin surfaces) default to
  // country behavior — identical to the pre-multi-competition app.
  const ctx = useCompetitionsSafe();
  const teamKind = ctx?.profile.teamKind ?? 'country';

  const getTeamName = (teamCode: string, fallbackName?: string): string => {
    if (!teamCode || teamCode === 'TBD') {
      return t('teams.TBD', 'TBD');
    }

    if (teamKind === 'club') {
      return fallbackName || teamCode;
    }

    const translationKey = `teams.${teamCode}`;
    const translated = t(translationKey, { defaultValue: '' });

    // If translation exists and isn't the key itself, use it
    if (translated && translated !== translationKey) {
      return translated;
    }

    // Fall back to provided name or lookup
    return fallbackName || fallbackTeamNames[teamCode] || teamCode;
  };

  return { getTeamName };
};
