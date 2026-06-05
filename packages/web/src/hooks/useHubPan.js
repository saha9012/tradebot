import { useEffect, useRef, useState } from 'react';

const LERP = 0.1;

function isDesktopPointer() {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(pointer: fine) and (min-width: 768px)').matches;
}

function prefersReducedMotion() {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Параллакс hub-слоя: в основном влево-вправо, lerp, только desktop. */
export default function useHubPan(enabled = true) {
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const targetRef = useRef({ x: 0, y: 0 });
  const currentRef = useRef({ x: 0, y: 0 });
  const rafRef = useRef(0);

  useEffect(() => {
    const active = enabled && isDesktopPointer() && !prefersReducedMotion();

    if (!active) {
      targetRef.current = { x: 0, y: 0 };
      currentRef.current = { x: 0, y: 0 };
      setPan({ x: 0, y: 0 });
      return undefined;
    }

    const onMove = (e) => {
      const nx = (e.clientX / window.innerWidth - 0.5) * 2;
      targetRef.current = { x: nx * 22, y: 0 };
    };

    const tick = () => {
      const t = targetRef.current;
      const c = currentRef.current;
      const next = {
        x: c.x + (t.x - c.x) * LERP,
        y: c.y + (t.y - c.y) * LERP,
      };
      currentRef.current = next;
      setPan(next);
      rafRef.current = requestAnimationFrame(tick);
    };

    window.addEventListener('mousemove', onMove, { passive: true });
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      window.removeEventListener('mousemove', onMove);
      cancelAnimationFrame(rafRef.current);
    };
  }, [enabled]);

  return pan;
}
