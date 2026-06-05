import { useEffect, useState } from 'react';

/** Фон в hub: сильный горизонтальный сдвиг, вертикаль почти не двигается. */
export default function usePagePan(enabled = true) {
  const [pan, setPan] = useState({ x: 0, y: 0 });

  useEffect(() => {
    if (!enabled) {
      setPan({ x: 0, y: 0 });
      return undefined;
    }

    const onMove = (e) => {
      const nx = (e.clientX / window.innerWidth - 0.5) * 2;
      const ny = (e.clientY / window.innerHeight - 0.5) * 2;
      setPan({
        x: nx * 48,
        y: ny * 5,
      });
    };

    window.addEventListener('mousemove', onMove, { passive: true });
    return () => window.removeEventListener('mousemove', onMove);
  }, [enabled]);

  return pan;
}
