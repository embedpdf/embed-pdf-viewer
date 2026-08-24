/**
 * The dumb renderer. Zero logic, zero state, zero event handlers — it paints
 * RenderNode[] and applies the page→view matrix. Shapes scale with zoom (drawn
 * under the matrix); handles/knobs are drawn at fixed pixel size (mapped to view
 * coords, then sized in px). This whole file is the per-framework "view" layer.
 */
import { Mat2D, apply, compose } from '../core/mat2d';
import { RenderNode } from '../core/view';

const mat = (m: Mat2D) => `matrix(${m.join(',')})`;
const ACCENT = '#1e88e5';

export function SceneSvg({
  nodes,
  toView,
  width,
  height,
}: {
  nodes: RenderNode[];
  toView: Mat2D;
  width: number;
  height: number;
}) {
  return (
    <svg
      width={width}
      height={height}
      style={{ position: 'absolute', inset: 0, overflow: 'visible' }}
    >
      {nodes.map((n, i) => {
        switch (n.kind) {
          case 'shape': {
            const t = compose(toView, n.transform);
            const common = {
              transform: mat(t),
              fill: n.ghost ? `${n.color}22` : `${n.color}33`,
              stroke: n.color,
              strokeWidth: 1.5,
              strokeDasharray: n.ghost ? '6 4' : undefined,
              vectorEffect: 'non-scaling-stroke' as const,
            };
            return n.shape === 'square' ? (
              <rect key={i} x={-0.5} y={-0.5} width={1} height={1} {...common} />
            ) : (
              <ellipse key={i} cx={0} cy={0} rx={0.5} ry={0.5} {...common} />
            );
          }
          case 'selectBox': {
            const t = compose(toView, n.transform);
            return (
              <rect
                key={i}
                x={-0.5}
                y={-0.5}
                width={1}
                height={1}
                transform={mat(t)}
                fill="none"
                stroke={ACCENT}
                strokeWidth={1}
                strokeDasharray="4 3"
                vectorEffect="non-scaling-stroke"
              />
            );
          }
          case 'handle': {
            const p = apply(toView, n.at);
            const r = 4;
            return (
              <rect
                key={i}
                x={p.x - r}
                y={p.y - r}
                width={2 * r}
                height={2 * r}
                fill="#fff"
                stroke={ACCENT}
                strokeWidth={1.5}
              />
            );
          }
          case 'rotateKnob': {
            const a = apply(toView, n.at);
            const b = apply(toView, n.from);
            return (
              <g key={i}>
                <line x1={b.x} y1={b.y} x2={a.x} y2={a.y} stroke={ACCENT} strokeWidth={1} />
                <circle cx={a.x} cy={a.y} r={5} fill="#fff" stroke={ACCENT} strokeWidth={1.5} />
              </g>
            );
          }
          case 'marquee':
          case 'groupBox': {
            const a = apply(toView, n.min);
            const b = apply(toView, n.max);
            return (
              <rect
                key={i}
                x={a.x}
                y={a.y}
                width={b.x - a.x}
                height={b.y - a.y}
                fill={n.kind === 'marquee' ? 'rgba(30,136,229,0.08)' : 'none'}
                stroke={ACCENT}
                strokeWidth={1}
                strokeDasharray="4 3"
              />
            );
          }
          case 'guide': {
            const isX = n.axis === 'x';
            const a = apply(toView, isX ? { x: n.at, y: n.lo } : { x: n.lo, y: n.at });
            const b = apply(toView, isX ? { x: n.at, y: n.hi } : { x: n.hi, y: n.at });
            return (
              <line
                key={i}
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                stroke="#e91e63"
                strokeWidth={1.5}
                shapeRendering="crispEdges"
              />
            );
          }
          case 'readout': {
            const p = apply(toView, n.at);
            const w = 48;
            const h = 22;
            const x = p.x + 12;
            const y = p.y - h / 2;
            return (
              <g key={i}>
                <rect x={x} y={y} width={w} height={h} rx={5} fill={n.snapped ? ACCENT : '#222'} />
                <text
                  x={x + w / 2}
                  y={y + h / 2 + 1}
                  fill="#fff"
                  fontSize={12}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fontFamily="system-ui, sans-serif"
                >
                  {n.text}
                </text>
              </g>
            );
          }
        }
      })}
    </svg>
  );
}
