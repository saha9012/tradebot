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
        scale: isPage ? 1 : 0.85,
        opacity: isPage ? 1 : 0.58,
        filter: isPage ? 'blur(0px)' : 'blur(8px)',
        x: 0,
        y: 0,
      }}
      transition={HORIZON_TRANSITION}
      style={{
        pointerEvents: isPage ? 'auto' : 'none',
        transformOrigin: '50% 50%',
        willChange: 'transform, filter, opacity',
      }}
      onDoubleClick={handleDoubleClick}
    >
      {!isPage && <div className="horizon-page-vignette pointer-events-none absolute inset-0 z-[1]" aria-hidden />}
      <div className="horizon-page-scroll relative z-[2] p-6 md:p-8 lg:p-10">
        <StatusMarquee />
        {children}
        {isPage && (
          <p className="horizon-page-hint pointer-events-none mt-8 text-center">
            Двойной клик по пустому месту — вернуться к ветке
          </p>
        )}
      </div>
    </motion.div>
  );
}
