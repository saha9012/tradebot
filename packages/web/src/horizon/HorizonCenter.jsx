import { motion } from 'framer-motion';
import { HORIZON_CENTER, HORIZON_TRANSITION } from './horizonRoutes';

export default function HorizonCenter({ mode }) {
  const isHub = mode === 'hub';

  return (
    <motion.div
      data-horizon-surface
      className="horizon-center pointer-events-auto absolute"
      style={{
        left: `${HORIZON_CENTER.x}%`,
        top: `${HORIZON_CENTER.y}%`,
        width: `${HORIZON_CENTER.widthPct}%`,
        minHeight: HORIZON_CENTER.minHeight,
      }}
      initial={false}
      animate={{
        x: '-50%',
        y: '-50%',
        scale: isHub ? 1 : 0.9,
        opacity: isHub ? 1 : 0.45,
      }}
      transition={HORIZON_TRANSITION}
    >
      <div className="horizon-center-inner flex h-full min-h-[140px] flex-col items-center justify-center rounded-2xl px-6 py-8 text-center">
        <p className="font-display text-[10px] font-bold uppercase tracking-[0.35em] text-white/35">
          Трейд судьбы
        </p>
        <p className="font-display mt-3 text-2xl font-extrabold tracking-tight text-white md:text-3xl">
          ИНДИ<span className="text-lime">З</span>
        </p>
        <p className="mt-4 max-w-[12rem] text-[11px] leading-relaxed text-white/28">
          антураж · позже сюда можно встроить блок
        </p>
      </div>
    </motion.div>
  );
}
