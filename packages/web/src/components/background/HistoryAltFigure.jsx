import { motion, AnimatePresence } from 'framer-motion';
import useMouseParallax from '../../hooks/useMouseParallax';

export default function HistoryAltFigure({ activePath, mode }) {
  const visible = activePath === '/history' && mode === 'page';
  const parallax = useMouseParallax(visible, 0.55);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          className="backdrop-alt-figure"
          aria-hidden
          initial={{ opacity: 0, scale: 0.97 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.98, transition: { duration: 0.35 } }}
          transition={{ duration: 0.85, ease: 'easeOut' }}
        >
          <div
            className="backdrop-alt-figure__inner"
            style={{
              transform: `translate(${parallax.x}px, ${parallax.y}px) rotate(${parallax.rotate * 0.35}deg)`,
            }}
          >
            <div className="backdrop-alt-figure__glow" />
            <img
              src={`${import.meta.env.BASE_URL}alt-girl-cosmic-transparent.png`}
              alt=""
              className="backdrop-alt-figure__img"
              loading="lazy"
              decoding="async"
            />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
