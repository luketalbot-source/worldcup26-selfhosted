// Full-screen "GOAL!!!" overlay that plays whenever a live match's score
// goes up — driven by the LiveMatchesProvider's goalEvent stream.
//
// Why a global overlay (vs. inline cards)?
//  - The user can be on Today, Groups, or Knockout when a goal happens.
//    A global overlay is the same eye-catching experience everywhere
//    without each view having to wire its own animation.
//  - Mounted once at the app root, it keeps rendering even if the
//    underlying view re-renders/unmounts (e.g. tab switch mid-celebration).
//
// Each new goal bumps `goalEvent.id`, which we use as the React key on
// the inner motion element — that guarantees a fresh mount/animation
// even when the same match scores twice in quick succession.

import { useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useLiveMatchesContext } from '@/contexts/LiveMatchesContext';
import { useTeams } from '@/hooks/useTeams';
import { Flag } from '@/components/Flag';
import { getFlagIconCode } from '@/lib/teamFlagCode';

const VISIBLE_MS = 4000; // total time the overlay stays on screen

export const GoalCelebration = () => {
  const { goalQueue, dismissGoal } = useLiveMatchesContext();
  const { getTeamByCode } = useTeams();

  // Animate the queue head. When it's been on screen for VISIBLE_MS we
  // dismiss it from the queue, which causes the next (if any) to slide
  // into the head position and start its own cycle. Goals never overlap
  // and none get dropped to React batching — both bugs the previous
  // single-state design suffered from.
  const active = goalQueue[0] ?? null;

  useEffect(() => {
    if (!active) return;
    const t = setTimeout(() => dismissGoal(active.id), VISIBLE_MS);
    return () => clearTimeout(t);
  }, [active?.id, dismissGoal]);

  if (!active) return null;

  const scorer = active.scoredBy === 'home' ? active.homeTeam : active.awayTeam;
  // Resolve the team metadata only as a name-fallback; the flag itself
  // comes from <Flag code=...> below so it renders identically across
  // platforms (no Windows emoji-letter fallback).
  const scoringTeamMeta = getTeamByCode(scorer.code);
  void scoringTeamMeta; // (still referenced for future score-board variants)
  const hasFlag = !!getFlagIconCode(scorer.code);

  return (
    <AnimatePresence>
      <motion.div
        key={active.id}
        // pointer-events-none so the celebration never blocks a click on
        // whatever's underneath. Backdrop is purely visual.
        className="fixed inset-0 z-[100] flex items-center justify-center pointer-events-none"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.25 }}
      >
        {/* Radial burst backdrop: bright dimmed gradient pulses behind text */}
        <motion.div
          className="absolute inset-0"
          style={{
            background:
              'radial-gradient(circle at center, rgba(255,99,71,0.55) 0%, rgba(0,0,0,0.7) 60%, rgba(0,0,0,0.85) 100%)',
          }}
          initial={{ scale: 0.6, opacity: 0 }}
          animate={{ scale: 1.0, opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.4 }}
        />

        {/* Confetti-ish radial dots: cheap CSS, no extra dep. Eight dots
            shoot outward from centre with staggered delays. */}
        {Array.from({ length: 12 }).map((_, i) => {
          const angle = (i / 12) * Math.PI * 2;
          const distance = 280;
          const dx = Math.cos(angle) * distance;
          const dy = Math.sin(angle) * distance;
          const colors = ['#FF6347', '#FFD700', '#FF1493', '#00CED1', '#7CFC00', '#FFA500'];
          return (
            <motion.div
              key={i}
              className="absolute w-3 h-3 rounded-full"
              style={{ background: colors[i % colors.length] }}
              initial={{ x: 0, y: 0, opacity: 0, scale: 0 }}
              animate={{ x: dx, y: dy, opacity: [0, 1, 1, 0], scale: [0, 1.4, 1, 0.7] }}
              transition={{ duration: 1.6, delay: 0.05 * i, ease: 'easeOut' }}
            />
          );
        })}

        {/* Main stack — flag, GOAL!!!, team, score */}
        <div className="relative flex flex-col items-center gap-3 text-center px-6">
          <motion.div
            initial={{ scale: 0, rotate: -30 }}
            animate={{ scale: [0, 1.4, 1], rotate: [0, 10, -10, 0] }}
            transition={{ duration: 0.7, ease: 'backOut' }}
            className="flex items-center justify-center"
          >
            {hasFlag ? (
              <Flag code={scorer.code} className="w-32 md:w-44 shadow-2xl" />
            ) : (
              // Unknown team code: keep the ⚽ fallback rather than a
              // grey rectangle; goals from synthetic / test data still
              // celebrate visibly.
              <span className="text-7xl md:text-8xl">⚽</span>
            )}
          </motion.div>

          <motion.h1
            className="text-6xl md:text-8xl font-black text-white drop-shadow-[0_4px_20px_rgba(255,99,71,0.7)] tracking-tight"
            style={{ WebkitTextStroke: '2px rgba(0,0,0,0.4)' }}
            initial={{ y: 60, scale: 0.5, opacity: 0 }}
            animate={{
              y: 0,
              scale: [0.5, 1.25, 1],
              opacity: 1,
            }}
            transition={{ duration: 0.6, ease: 'backOut', delay: 0.1 }}
          >
            GOAL!!!
          </motion.h1>

          <motion.div
            className="text-2xl md:text-3xl font-bold text-white"
            initial={{ y: 30, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.4, delay: 0.4 }}
          >
            {scorer.name}
          </motion.div>

          <motion.div
            className="text-xl md:text-2xl font-mono text-white/90 bg-black/40 px-4 py-1.5 rounded-lg backdrop-blur-sm"
            initial={{ y: 30, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.4, delay: 0.55 }}
          >
            {active.homeTeam.code} {active.homeScore} — {active.awayScore} {active.awayTeam.code}
          </motion.div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
};
