import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { LogIn, Loader2, Trophy } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useBoostAwards } from '@/hooks/useBoostAwards';
import { BoostAwardCard } from './BoostAwardCard';

export const BoostView = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const navigate = useNavigate();
  const {
    awards,
    loading,
    savePrediction,
    getPrediction,
    getResult,
    isLocked,
    getTotalPoints,
  } = useBoostAwards();

  const renderLoginPrompt = () => {
    if (user) return null;
    return (
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-accent/10 border border-accent/20 rounded-xl p-4 flex items-center justify-between"
      >
        <p className="text-sm text-foreground">
          <strong>{t('header.login')}</strong> {t('boost.loginPrompt')}
        </p>
        <button
          onClick={() => navigate('/auth')}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-accent text-accent-foreground font-semibold text-sm"
        >
          <LogIn className="w-4 h-4" />
          {t('header.login')}
        </button>
      </motion.div>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  const totalPoints = getTotalPoints();

  return (
    <div className="space-y-4 max-w-[700px] mx-auto">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-card rounded-2xl shadow-card border border-border/50 overflow-hidden"
      >
        <div className="gradient-navy px-4 py-6 text-center">
          <h2 className="text-xl font-bold text-white">{t('boost.title')}</h2>
          <p className="text-white/70 text-sm mt-1">{t('boost.subtitle')}</p>
        </div>
      </motion.div>

      {/* Points Summary */}
      {user && totalPoints > 0 && (
        <motion.div
          initial={{ scale: 0.95 }}
          animate={{ scale: 1 }}
          className="bg-gradient-to-r from-primary/20 to-accent/20 rounded-xl p-4 text-center"
        >
          <div className="flex items-center justify-center gap-2 mb-1">
            <Trophy className="w-5 h-5 text-primary" />
            <span className="font-bold text-lg">{totalPoints} {t('boost.bonusPoints')}</span>
          </div>
          <p className="text-sm text-muted-foreground">{t('boost.fromCorrectPredictions')}</p>
        </motion.div>
      )}

      {renderLoginPrompt()}

      {/* Award Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {awards.map((award, index) => (
          <motion.div
            key={award.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.05 }}
          >
            <BoostAwardCard
              award={award}
              prediction={getPrediction(award.id)}
              result={getResult(award.id)}
              isLocked={isLocked(award)}
              onSave={(teamCode, playerName) => savePrediction(award.id, teamCode, playerName)}
              disabled={!user}
            />
          </motion.div>
        ))}
      </div>

      {/* Info Card */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5 }}
        className="bg-muted/50 rounded-xl p-4 text-center text-sm text-muted-foreground"
      >
        <p>{t('boost.infoText')}</p>
      </motion.div>
    </div>
  );
};
