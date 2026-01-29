import { useState } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { LogIn, Loader2, Trophy, Star, Sparkles } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useBoostAwards } from '@/hooks/useBoostAwards';
import { useCustomBoostAwards } from '@/hooks/useCustomBoostAwards';
import { BoostAwardCard } from './BoostAwardCard';
import { CustomBoostAwardCard } from './CustomBoostAwardCard';
import mascotImage from '@/assets/mascots-waiting.png';

type BoostTab = 'standard' | 'extra';

export const BoostView = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<BoostTab>('standard');
  
  const {
    awards,
    loading,
    savePrediction,
    getPrediction,
    getResult,
    isLocked,
    getTotalPoints,
  } = useBoostAwards();

  const {
    awards: customAwards,
    loading: customLoading,
    savePrediction: saveCustomPrediction,
    getPrediction: getCustomPrediction,
    getResult: getCustomResult,
    isLocked: isCustomLocked,
    getTotalPoints: getCustomTotalPoints,
  } = useCustomBoostAwards();

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

  const renderTabSelector = () => (
    <div className="flex gap-2 p-1 bg-muted rounded-xl">
      <motion.button
        whileTap={{ scale: 0.95 }}
        onClick={() => setActiveTab('standard')}
        className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg font-semibold text-sm transition-all ${
          activeTab === 'standard'
            ? 'bg-primary text-primary-foreground shadow-md'
            : 'text-muted-foreground hover:text-foreground'
        }`}
      >
        <Trophy className="w-4 h-4" />
        {t('boost.standard')}
      </motion.button>
      <motion.button
        whileTap={{ scale: 0.95 }}
        onClick={() => setActiveTab('extra')}
        className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg font-semibold text-sm transition-all ${
          activeTab === 'extra'
            ? 'bg-accent text-accent-foreground shadow-md'
            : 'text-muted-foreground hover:text-foreground'
        }`}
      >
        <Sparkles className="w-4 h-4" />
        {t('boost.extra')}
        {customAwards.length > 0 && (
          <span className="ml-1 px-1.5 py-0.5 text-xs rounded-full bg-background/50">
            {customAwards.length}
          </span>
        )}
      </motion.button>
    </div>
  );

  const renderEmptyExtraState = () => (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col items-center justify-center py-8 text-center"
    >
      <img 
        src={mascotImage} 
        alt="Mascots waiting" 
        className="w-full max-w-[300px] mb-6 opacity-80"
      />
      <h3 className="text-lg font-semibold text-foreground mb-2">
        {t('boost.noExtraBoosts')}
      </h3>
      <p className="text-sm text-muted-foreground max-w-sm">
        {t('boost.noExtraBoostsDesc')}
      </p>
    </motion.div>
  );

  if (loading || customLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  const totalPoints = getTotalPoints() + getCustomTotalPoints();

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

      {/* Tab Selector */}
      {renderTabSelector()}

      {/* Standard Awards */}
      {activeTab === 'standard' && (
        <motion.div
          key="standard"
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 20 }}
          className="grid grid-cols-1 sm:grid-cols-2 gap-4"
        >
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
        </motion.div>
      )}

      {/* Extra Awards */}
      {activeTab === 'extra' && (
        <motion.div
          key="extra"
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -20 }}
        >
          {customAwards.length === 0 ? (
            renderEmptyExtraState()
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {customAwards.map((award, index) => (
                <motion.div
                  key={award.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.05 }}
                >
                  <CustomBoostAwardCard
                    award={award}
                    prediction={getCustomPrediction(award.id)}
                    result={getCustomResult(award.id)}
                    isLocked={isCustomLocked(award)}
                    onSave={(teamCode, playerName) => saveCustomPrediction(award.id, teamCode, playerName)}
                    disabled={!user}
                  />
                </motion.div>
              ))}
            </div>
          )}
        </motion.div>
      )}

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
