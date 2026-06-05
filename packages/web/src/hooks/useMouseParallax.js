import { useEffect, useRef, useState } from 'react';

const LERP = 0.08;

function isDesktopPointer() {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(pointer: fine) and (min-width: 768px)').matches;
}

function prefersReducedMotion() {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Лёгкий параллакс ветки в page-режиме: translate + rotate, lerp, только desktop. */
export default function useMouseParallax(enabled = true, strength = 1) {
  const [offset, setOffset] = useState({ x: 0, y: 0, rotate: 0 });
  const targetRef = useRef({ x: 0, y: 0, rotate: 0 });
  const currentRef = useRef({ x: 0, y: 0, rotate: 0 });
  const rafRef = useRef(0);

  useEffect(() => {
    const active = enabled && isDesktopPointer() && !prefersReducedMotion();

    if (!active) {
      targetRef.current = { x: 0, y: 0, rotate: 0 };
      currentRef.current = { x: 0, y: 0, rotate: 0 };
      setOffset({ x: 0, y: 0, rotate: 0 });
      return undefined;
    }

    const onMove = (e) => {
      const nx = (e.clientX / window.innerWidth - 0.5) * 2;
      const ny = (e.clientY / window.innerHeight - 0.5) * 2;
      targetRef.current = {
        x: nx * 10 * strength,
        y: ny * 6 * strength,
        rotate: nx * 0.55 * strength,
      };
    };

    const tick = () => {
      const t = targetRef.current;
      const c = currentRef.current;
      const next = {
        x: c.x + (t.x - c.x) * LERP,
        y: c.y + (t.y - c.y) * LERP,
        rotate: c.rotate + (t.rotate - c.rotate) * LERP,
      };
      currentRef.current = next;
      setOffset(next);
      rafRef.current = requestAnimationFrame(tick);
    };

    window.addEventListener('mousemove', onMove, { passive: true });
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      window.removeEventListener('mousemove', onMove);
      cancelAnimationFrame(rafRef.current);
    };
  }, [enabled, strength]);

  return offset;
}
