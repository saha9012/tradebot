import { useEffect, useState } from 'react';

/** Лёгкий параллакс «стекло на воде» — фаза 2 усилит значения. */
export default function useMouseParallax(enabled = true, strength = 1) {
  const [offset, setOffset] = useState({ x: 0, y: 0, rotate: 0 });

  useEffect(() => {
    if (!enabled) {
      setOffset({ x: 0, y: 0, rotate: 0 });
      return undefined;
    }

    const onMove = (e) => {
      const nx = (e.clientX / window.innerWidth - 0.5) * 2;
      const ny = (e.clientY / window.innerHeight - 0.5) * 2;
      setOffset({
        x: nx * 6 * strength,
        y: ny * 4 * strength,
        rotate: nx * 0.4 * strength,
      });
    };

    window.addEventListener('mousemove', onMove, { passive: true });
    return () => window.removeEventListener('mousemove', onMove);
  }, [enabled, strength]);

  return offset;
}
