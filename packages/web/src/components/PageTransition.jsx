import { motion } from 'framer-motion';

const EASE = [0.22, 1, 0.36, 1];

export default function PageTransition({ children, mode = 'page' }) {
  const isHub = mode === 'hub';

  return (
    <motion.div
      className={isHub ? 'absolute inset-0 overflow-hidden' : 'relative'}
      initial={{
        opacity: 0,
        y: isHub ? 18 : 12,
        filter: isHub ? 'blur(6px)' : 'blur(0px)',
      }}
      animate={{
        opacity: 1,
        y: 0,
        filter: 'blur(0px)',
      }}
      exit={{
        opacity: 0,
        y: isHub ? -10 : -6,
        filter: isHub ? 'blur(4px)' : 'blur(0px)',
      }}
      transition={{
        duration: isHub ? 0.75 : 0.45,
        ease: EASE,
      }}
      style={{ willChange: isHub ? 'opacity, transform, filter' : undefined }}
    >
      {children}
    </motion.div>
  );
}
