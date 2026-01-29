import { useTranslation } from 'react-i18next';
import { fallbackTeamNames } from '@/lib/teamTranslations';

/**
 * Hook to get translated team names
 * Falls back to English if translation not available
 */
export const useTeamName = () => {
  const { t, i18n } = useTranslation();

  const getTeamName = (teamCode: string, fallbackName?: string): string => {
    if (!teamCode || teamCode === 'TBD') {
      return t('teams.TBD', 'TBD');
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
