import { motion, useMotionValue } from 'framer-motion';
import { useEffect, useMemo } from 'react';
import { createDriftSeed, driftOffset } from './nodeDrift';

export default function HorizonNode({
  node,
  x,
  y,
  active,
  isHub,
  onNodeClick,
  index,
  onMeasureRef,
}) {
  const seed = useMemo(() => createDriftSeed(node.id), [node.id]);
  const driftX = useMotionValue(0);
  const driftY = useMotionValue(0);

  useEffect(() => {
    if (!isHub) {
      driftX.set(0);
      driftY.set(0);
      return undefined;
    }

    let raf = 0;
    const tick = (time) => {
      const offset = driftOffset(seed, time / 1000);
      driftX.set(offset.x);
      driftY.set(offset.y);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [isHub, seed, driftX, driftY]);

  return (
    <div className="horizon-node-anchor" style={{ left: `${x}%`, top: `${y}%` }}>
      <motion.div style={{ x: driftX, y: driftY }}>
        <div
          className={`horizon-node-wrap ${isHub ? 'horizon-node-wrap--hub' : ''} ${active ? 'horizon-node-wrap--active' : ''}`}
        >
          <span className="horizon-node-halo" aria-hidden="true" />
          <motion.button
            ref={(el) => onMeasureRef?.(node.id, el)}
            type="button"
            data-horizon-surface
            className={`horizon-node ${isHub ? 'horizon-node--hub' : ''} ${active ? 'horizon-node--active' : ''}`}
            onClick={() => onNodeClick?.(node.path)}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.04 * index, duration: 0.35 }}
          >
            <span className="horizon-node-label">{node.label}</span>
          </motion.button>
        </div>
      </motion.div>
    </div>
  );
}
