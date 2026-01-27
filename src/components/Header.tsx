import { motion } from 'framer-motion';
import { Trophy } from 'lucide-react';

export const Header = () => {
  return (
    <header className="gradient-navy text-white sticky top-0 z-50">
      <div className="container py-4">
        <motion.div 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center justify-between"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl gradient-hero flex items-center justify-center shadow-glow">
              <Trophy className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight">WC 2026</h1>
              <p className="text-xs text-white/70">Predictor</p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <span className="text-2xl">🇺🇸</span>
            <span className="text-2xl">🇲🇽</span>
            <span className="text-2xl">🇨🇦</span>
          </div>
        </motion.div>
      </div>
    </header>
  );
};
