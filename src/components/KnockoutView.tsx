import { useState } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { Trophy, Lock, LogIn, Info } from 'lucide-react';
import { KnockoutMatchCard } from './KnockoutMatchCard';
import { usePredictions } from '@/hooks/usePredictions';
import { useDynamicKnockout } from '@/hooks/useDynamicKnockout';
import { useAuth } from '@/contexts/AuthContext';

type KnockoutStage = 'round32' | 'round16' | 'quarter' | 'semi' | 'finals';

const stageLabels: Record<KnockoutStage, string> = {
  round32: 'Round of 32',
  round16: 'Round of 16',
  quarter: 'Quarter Finals',
  semi: 'Semi Finals',
  finals: 'Finals',
};

export const KnockoutView = () => {
  const [activeStage, setActiveStage] = useState<KnockoutStage>('round32');
  const { addPrediction, getPrediction } = usePredictions();
  const { getKnockoutStageMatches, areGroupStagesComplete, qualificationSummary, knockoutBracket } = useDynamicKnockout();
  const { user } = useAuth();
  const navigate = useNavigate();

  const getStageMatches = () => {
    switch (activeStage) {
      case 'round32':
        return getKnockoutStageMatches('round32');
      case 'round16':
        return getKnockoutStageMatches('round16');
      case 'quarter':
        return getKnockoutStageMatches('quarter');
      case 'semi':
        return getKnockoutStageMatches('semi');
      case 'finals':
        return [
          ...getKnockoutStageMatches('third'),
          ...getKnockoutStageMatches('final'),
        ];
      default:
        return [];
    }
  };

  const matches = getStageMatches();

  return (
    <div className="space-y-4">
      {!user && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-accent/10 border border-accent/20 rounded-xl p-4 flex items-center justify-between"
        >
          <p className="text-sm text-foreground">
            <strong>Log in</strong> to save your predictions!
          </p>
          <button
            onClick={() => navigate('/auth')}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-accent text-accent-foreground font-semibold text-sm"
          >
            <LogIn className="w-4 h-4" />
            Log In
          </button>
        </motion.div>
      )}

      {/* Stage Tabs */}
      <div className="sticky top-[72px] bg-background z-40 py-3 -mx-4 px-4">
        <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
          {(Object.keys(stageLabels) as KnockoutStage[]).map((stage) => (
            <motion.button
              key={stage}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => setActiveStage(stage)}
              className={`relative px-4 py-2 rounded-xl font-semibold text-sm transition-all whitespace-nowrap ${
                activeStage === stage
                  ? 'bg-fifa-coral text-white shadow-md'
                  : 'bg-card text-muted-foreground hover:bg-muted'
              }`}
            >
              {stage === 'finals' && <Trophy className="w-4 h-4 inline mr-1" />}
              {stageLabels[stage]}
            </motion.button>
          ))}
        </div>
      </div>

      {/* Dynamic Info Banner */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className={`border rounded-xl p-3 flex items-start gap-3 ${
          areGroupStagesComplete 
            ? 'bg-fifa-green/5 border-fifa-green/20' 
            : 'bg-primary/5 border-primary/20'
        }`}
      >
        <Info className={`w-5 h-5 flex-shrink-0 mt-0.5 ${
          areGroupStagesComplete ? 'text-fifa-green' : 'text-primary'
        }`} />
        <div>
          <p className="text-sm text-foreground font-medium">
            {areGroupStagesComplete 
              ? '✓ Group stages complete!' 
              : '48-team format'
            }
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            {areGroupStagesComplete 
              ? 'Knockout teams have been determined. Make your predictions!'
              : `${qualificationSummary.qualified.length}/${qualificationSummary.total} groups decided. Teams update automatically when group stages finish.`
            }
          </p>
        </div>
      </motion.div>

      {/* Matches */}
      <motion.div 
        key={activeStage}
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.3 }}
        className="space-y-4"
      >
        {activeStage === 'finals' && (
          <>
            <div className="text-center py-2">
              <h3 className="text-lg font-bold text-foreground">🏆 The Final</h3>
              <p className="text-sm text-muted-foreground">July 19, 2026 • New York</p>
            </div>
            <KnockoutMatchCard
              match={knockoutBracket.final}
              prediction={getPrediction(knockoutBracket.final.id)}
              onPredict={addPrediction}
              disabled={!user}
              isHighlighted
            />
            <div className="text-center py-2 mt-4">
              <h3 className="text-base font-semibold text-muted-foreground">🥉 Third Place</h3>
            </div>
            <KnockoutMatchCard
              match={knockoutBracket.thirdPlace}
              prediction={getPrediction(knockoutBracket.thirdPlace.id)}
              onPredict={addPrediction}
              disabled={!user}
            />
          </>
        )}

        {activeStage !== 'finals' && matches.map((match) => (
          <KnockoutMatchCard
            key={match.id}
            match={match}
            prediction={getPrediction(match.id)}
            onPredict={addPrediction}
            disabled={!user}
          />
        ))}
      </motion.div>
    </div>
  );
};
