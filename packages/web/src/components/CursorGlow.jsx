import { useEffect, useState } from 'react';
import { motion, useSpring } from 'framer-motion';

export default function CursorGlow() {
  const [enabled, setEnabled] = useState(false);
  const spring = { stiffness: 150, damping: 20 };
  const x = useSpring(0, spring);
  const y = useSpring(0, spring);

  useEffect(() => {
    const finePointer = window.matchMedia('(pointer: fine)').matches;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!finePointer || reducedMotion) return undefined;

    setEnabled(true);
    const move = (e) => {
      x.set(e.clientX);
      y.set(e.clientY);
    };
    window.addEventListener('mousemove', move);
    return () => window.removeEventListener('mousemove', move);
  }, [x, y]);

  if (!enabled) return null;

  return (
    <motion.div
      className="pointer-events-none fixed z-[100] h-80 w-80 -translate-x-1/2 -translate-y-1/2 rounded-full mix-blend-screen"
      style={{
        left: x,
        top: y,
        background:
          'radial-gradient(circle, rgba(0,240,255,0.12) 0%, rgba(255,45,146,0.06) 40%, transparent 70%)',
      }}
    />
  );
}
