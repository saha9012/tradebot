import { useEffect, useState } from 'react';

/** Параллакс hub-слоя: в основном влево-вправо, вертикаль почти нулевая. */
export default function useHubPan(enabled = true) {
  const [pan, setPan] = useState({ x: 0, y: 0 });

  useEffect(() => {
    if (!enabled) {
      setPan({ x: 0, y: 0 });
      return undefined;
    }

    const onMove = (e) => {
      const nx = (e.clientX / window.innerWidth - 0.5) * 2;
      setPan({
        x: nx * 22,
        y: 0,
      });
    };

    window.addEventListener('mousemove', onMove, { passive: true });
    return () => window.removeEventListener('mousemove', onMove);
  }, [enabled]);

  return pan;
}
