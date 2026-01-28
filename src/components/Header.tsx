import { motion } from 'framer-motion';
import wc2026Logo from '@/assets/wc2026-logo.png';

export const Header = () => {
  return (
    <header className="text-foreground sticky top-0 z-50 bg-background">
      <div className="container py-4">
        <motion.div 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center justify-center"
        >
          <div className="flex-shrink-0">
            <img 
              src={wc2026Logo} 
              alt="FIFA World Cup 2026" 
              className="h-12 w-auto object-contain"
            />
          </div>
        </motion.div>
      </div>
    </header>
  );
};
