import { motion } from 'framer-motion';
import StatusMarquee from '../components/StatusMarquee';
import { isHorizonBackdropTarget } from './backdrop';
import { HORIZON_TRANSITION } from './horizonRoutes';

export default function PageShell({ mode, children, onBackdropDoubleClick }) {
  const isPage = mode === 'page';

  const handleDoubleClick = (e) => {
    if (!isPage) return;
    if (!isHorizonBackdropTarget(e.target)) return;
    onBackdropDoubleClick?.();
  };

  return (
    <motion.div
      className={`horizon-page-layer absolute inset-0 z-10 ${
        isPage ? 'overflow-y-auto overflow-x-hidden' : 'overflow-hidden'
      }`}
      animate={{
        scale: isPage ? 1 : 0.8,
        opacity: isPage ? 1 : 0.58,
        filter: isPage ? 'blur(0px)' : 'blur(2px)',
        x: 0,
        y: 0,
      }}
      transition={HORIZON_TRANSITION}
      style={{
        pointerEvents: isPage ? 'auto' : 'none',
        transformOrigin: '50% 50%',
      }}
      onDoubleClick={handleDoubleClick}
    >
      <div className="horizon-page-scroll p-6 md:p-8 lg:p-10">
        <StatusMarquee />
        {children}
        {isPage && (
          <p className="pointer-events-none mt-8 text-center text-[11px] text-white/20">
            Двойной клик по пустому месту — вернуться к ветке
          </p>
        )}
      </div>
    </motion.div>
  );
}
