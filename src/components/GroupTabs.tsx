import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';

interface GroupTabsProps {
  groups: string[];
  activeGroup: string;
  onGroupChange: (group: string) => void;
  vertical?: boolean;
}

export const GroupTabs = ({ groups, activeGroup, onGroupChange, vertical = false }: GroupTabsProps) => {
  const { t } = useTranslation();

  return (
    <div className={`flex gap-2 scrollbar-hide ${
      vertical 
        ? 'flex-col' 
        : 'overflow-x-auto pb-2'
    }`}>
      {groups.map((group) => (
        <motion.button
          key={group}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => onGroupChange(group)}
          className={`px-4 py-2 rounded-xl font-semibold text-sm transition-all whitespace-nowrap ${
            vertical ? 'text-left' : ''
          } ${
            activeGroup === group
              ? 'bg-primary text-primary-foreground shadow-md'
              : 'bg-card text-muted-foreground hover:bg-muted'
          }`}
        >
          {t('standings.group')} {group}
        </motion.button>
      ))}
    </div>
  );
};