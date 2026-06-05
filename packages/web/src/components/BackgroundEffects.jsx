import { motion } from 'framer-motion';
import AltVeil from './background/AltVeil';
import GothicVeil from './background/GothicVeil';
import HistoryAltFigure from './background/HistoryAltFigure';
import Starfield from './background/Starfield';

export default function BackgroundEffects({ activePath, mode }) {
  return (
    <div className="void-backdrop pointer-events-none fixed inset-0 z-0 overflow-hidden">
      <div className="void-depth absolute inset-0" />

      <GothicVeil />
      <AltVeil />
      <Starfield />
      <HistoryAltFigure activePath={activePath} mode={mode} />

      <div className="grid-bg absolute inset-0 opacity-40" />
      <motion.div
        className="absolute -left-32 top-1/4 h-[500px] w-[500px] rounded-full bg-cyan-500/14 blur-[120px]"
        animate={{ x: [0, 40, 0], y: [0, -30, 0] }}
        transition={{ duration: 12, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        className="absolute -right-24 top-1/3 h-[450px] w-[450px] rounded-full bg-fuchsia-500/12 blur-[120px]"
        animate={{ x: [0, -50, 0], y: [0, 40, 0] }}
        transition={{ duration: 14, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        className="absolute bottom-0 left-1/2 h-[400px] w-[600px] -translate-x-1/2 rounded-full bg-violet-500/10 blur-[100px]"
        animate={{ scale: [1, 1.1, 1] }}
        transition={{ duration: 10, repeat: Infinity, ease: 'easeInOut' }}
      />
      <div
        className="absolute inset-0 opacity-[0.1]"
        style={{
          background:
            'radial-gradient(ellipse 60% 50% at 50% -10%, rgba(0,240,255,0.35), transparent 50%)',
        }}
      />
      <div className="void-vignette absolute inset-0" />
    </div>
  );
}
