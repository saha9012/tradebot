import { motion } from 'framer-motion';
import { useCallback, useEffect, useRef } from 'react';
import useHubPan from '../hooks/useHubPan';
import useMouseParallax from '../hooks/useMouseParallax';
import HorizonCenter from './HorizonCenter';
import HorizonEdges from './HorizonEdges';
import HorizonNode from './HorizonNode';
import { isHorizonBackdropTarget } from './backdrop';
import { HORIZON_NODES, HORIZON_TRANSITION, nodePosition } from './horizonRoutes';

function isPathActive(nodePath, activePath) {
  if (nodePath === '/') return activePath === '/';
  return activePath === nodePath || activePath.startsWith(`${nodePath}/`);
}

export default function HorizonNav({ mode, activePath, onNodeClick, onBackdropDoubleClick }) {
  const isHub = mode === 'hub';
  const hubPan = useHubPan(isHub);
  const pageParallax = useMouseParallax(!isHub, 0.42);
  const branchRef = useRef(null);
  const edgesRef = useRef(null);
  const nodeRefs = useRef({});

  const registerNodeRef = useCallback((id, el) => {
    if (el) nodeRefs.current[id] = el;
    else delete nodeRefs.current[id];
  }, []);

  useEffect(() => {
    if (!isHub) return undefined;

    let raf = 0;
    const measure = () => {
      const box = branchRef.current?.getBoundingClientRect();
      if (box && edgesRef.current) {
        const anchors = {};
        for (const node of HORIZON_NODES) {
          const el = nodeRefs.current[node.id];
          if (!el) continue;
          const rect = el.getBoundingClientRect();
          anchors[node.id] = {
            x: rect.left + rect.width / 2 - box.left,
            y: rect.top + rect.height / 2 - box.top,
          };
        }
        edgesRef.current.update(anchors);
      }
      raf = requestAnimationFrame(measure);
    };

    raf = requestAnimationFrame(measure);
    return () => cancelAnimationFrame(raf);
  }, [isHub]);

  const handleLayerDoubleClick = (e) => {
    if (!isHorizonBackdropTarget(e.target)) return;
    onBackdropDoubleClick?.();
  };

  return (
    <>
      <motion.div
        className="horizon-nav-layer absolute inset-0 z-20 overflow-hidden"
        animate={{
          scale: isHub ? 1 : 0.85,
          opacity: isHub ? 1 : 0.42,
          filter: isHub ? 'blur(0px)' : 'blur(8px)',
          x: isHub ? hubPan.x : pageParallax.x,
          y: isHub ? 0 : pageParallax.y,
          rotate: isHub ? 0 : pageParallax.rotate,
        }}
        transition={HORIZON_TRANSITION}
        style={{
          pointerEvents: isHub ? 'auto' : 'none',
          transformOrigin: '50% 48%',
          willChange: 'transform, filter, opacity',
        }}
        onDoubleClick={isHub ? handleLayerDoubleClick : undefined}
      >
        <div
          ref={branchRef}
          className="horizon-branch-band relative mx-auto h-full w-full max-w-[1400px]"
        >
          <HorizonEdges ref={edgesRef} />

          {HORIZON_NODES.map((node, i) => {
            const active = isPathActive(node.path, activePath);
            const { x, y } = nodePosition(node);
            return (
              <HorizonNode
                key={node.id}
                node={node}
                x={x}
                y={y}
                active={active}
                isHub={isHub}
                index={i}
                onNodeClick={onNodeClick}
                onMeasureRef={registerNodeRef}
              />
            );
          })}
        </div>

        {isHub && (
          <p className="horizon-hub-hint pointer-events-none absolute bottom-6 left-1/2 z-30 -translate-x-1/2 text-center">
            Клик по узлу — смена страницы на фоне · двойной клик по пустому месту — открыть страницу
          </p>
        )}
      </motion.div>

      <HorizonCenter mode={mode} activePath={activePath} />
    </>
  );
}
