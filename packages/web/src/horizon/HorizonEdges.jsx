import { forwardRef, useImperativeHandle, useRef } from 'react';
import { HORIZON_EDGES } from './horizonRoutes';

function edgeStroke(edge) {
  if (edge.dashed) return 'rgba(0, 240, 255, 0.42)';
  if (edge.dim) return 'rgba(0, 240, 255, 0.48)';
  return 'rgba(0, 240, 255, 0.78)';
}

const HorizonEdges = forwardRef(function HorizonEdges(_props, ref) {
  const lineRefs = useRef({});

  useImperativeHandle(ref, () => ({
    update(anchors) {
      for (const edge of HORIZON_EDGES) {
        const key = `${edge.from}-${edge.to}`;
        const line = lineRefs.current[key];
        const glow = lineRefs.current[`${key}-glow`];
        const from = anchors[edge.from];
        const to = anchors[edge.to];
        if (!line || !from || !to) continue;

        const t = edge.breakAt ?? 1;
        const x2 = from.x + (to.x - from.x) * t;
        const y2 = from.y + (to.y - from.y) * t;

        for (const el of [line, glow]) {
          if (!el) continue;
          el.setAttribute('x1', String(from.x));
          el.setAttribute('y1', String(from.y));
          el.setAttribute('x2', String(x2));
          el.setAttribute('y2', String(y2));
        }
      }
    },
  }));

  return (
    <svg className="horizon-edge-layer pointer-events-none absolute inset-0 h-full w-full" aria-hidden>
      <defs>
        <filter id="horizon-aurora-glow" x="-80%" y="-80%" width="260%" height="260%">
          <feGaussianBlur stdDeviation="2.8" result="blur" />
          <feColorMatrix
            in="blur"
            type="matrix"
            values="0 0 0 0 0
                    0 0 0 0 0.94
                    0 0 0 0 1
                    0 0 0 0.75 0"
            result="cyanBlur"
          />
          <feMerge>
            <feMergeNode in="cyanBlur" />
            <feMergeNode in="cyanBlur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {HORIZON_EDGES.map((edge) => {
        const key = `${edge.from}-${edge.to}`;
        const stroke = edgeStroke(edge);
        const dash = edge.dashed ? '5 6' : undefined;

        return (
          <g key={key}>
            <line
              ref={(el) => {
                lineRefs.current[`${key}-glow`] = el;
              }}
              x1={0}
              y1={0}
              x2={0}
              y2={0}
              stroke={stroke}
              strokeWidth={2.4}
              strokeOpacity={0.35}
              strokeLinecap="round"
              vectorEffect="nonScalingStroke"
              strokeDasharray={dash}
              filter="url(#horizon-aurora-glow)"
            />
            <line
              ref={(el) => {
                lineRefs.current[key] = el;
              }}
              x1={0}
              y1={0}
              x2={0}
              y2={0}
              stroke={stroke}
              strokeWidth={1}
              strokeLinecap="round"
              vectorEffect="nonScalingStroke"
              strokeDasharray={dash}
              filter="url(#horizon-aurora-glow)"
            />
          </g>
        );
      })}
    </svg>
  );
});

export default HorizonEdges;
