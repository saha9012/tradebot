import { motion } from 'framer-motion';
import { HORIZON_CENTER, HORIZON_NODES, HORIZON_TRANSITION } from './horizonRoutes';

function activeNodeLabel(path) {
  const node = HORIZON_NODES.find((n) =>
    n.path === '/' ? path === '/' : path === n.path || path.startsWith(`${n.path}/`),
  );
  return node?.label ?? 'Обзор';
}

export default function HorizonCenter({ mode, activePath }) {
  const isHub = mode === 'hub';
  const sector = activeNodeLabel(activePath);

  return (
    <motion.div
      data-horizon-surface
      className={`horizon-center pointer-events-none absolute ${isHub ? 'horizon-center--hub' : 'horizon-center--page'}`}
      style={{
        left: `${HORIZON_CENTER.x}%`,
        top: `${HORIZON_CENTER.y}%`,
        width: `${HORIZON_CENTER.widthPct}%`,
        minWidth: '9.5rem',
        minHeight: HORIZON_CENTER.minHeight,
      }}
      initial={false}
      animate={{
        x: '-50%',
        y: '-50%',
        scale: isHub ? 1 : 0.88,
        opacity: isHub ? 1 : 0.38,
        filter: isHub ? 'blur(0px)' : 'blur(6px)',
      }}
      transition={HORIZON_TRANSITION}
    >
      <span className="horizon-center-halo" aria-hidden="true" />
      <div className="horizon-center-inner">
        <span className="horizon-center-corner horizon-center-corner--tl" aria-hidden="true" />
        <span className="horizon-center-corner horizon-center-corner--tr" aria-hidden="true" />
        <span className="horizon-center-corner horizon-center-corner--bl" aria-hidden="true" />
        <span className="horizon-center-corner horizon-center-corner--br" aria-hidden="true" />

        <p className="horizon-center-eyebrow font-display">Трейд судьбы</p>
        <p className="horizon-center-title font-display">
          ИНДИ<span className="horizon-center-z">З</span>
        </p>
        <div className="horizon-center-divider" aria-hidden="true" />
        <p className="horizon-center-sector">
          <span className="horizon-center-sector-label">сектор</span>
          <span className="horizon-center-sector-value">{sector}</span>
        </p>
      </div>
    </motion.div>
  );
}
