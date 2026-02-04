import { CSSProperties, MouseEvent, TouchEvent } from '@framework';
import { Rect } from '@embedpdf/models';

type SquigglyProps = {
  /** Stroke/markup color */
  strokeColor?: string;
  opacity?: number;
  segmentRects: Rect[];
  rect?: Rect;
  scale: number;
  onClick?: (e: MouseEvent<HTMLDivElement> | TouchEvent<HTMLDivElement>) => void;
  style?: CSSProperties;
};

export function Squiggly({
  strokeColor,
  opacity = 0.5,
  segmentRects,
  rect,
  scale,
  onClick,
  style,
}: SquigglyProps) {
  const resolvedColor = strokeColor ?? '#FFFF00';
  const amplitude = 2 * scale; // wave height
  const period = 6 * scale; // wave length

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${period}" height="${amplitude * 2}" viewBox="0 0 ${period} ${amplitude * 2}">
      <path d="M0 ${amplitude} Q ${period / 4} 0 ${period / 2} ${amplitude} T ${period} ${amplitude}"
            fill="none" stroke="${resolvedColor}" stroke-width="${amplitude}" stroke-linecap="round"/>
    </svg>`;

  // Completely escape the SVG markup
  const svgDataUri = `url("data:image/svg+xml;utf8,${encodeURIComponent(svg)}")`;

  return (
    <>
      {segmentRects.map((r, i) => (
        <div
          key={i}
          onPointerDown={onClick}
          onTouchStart={onClick}
          style={{
            position: 'absolute',
            left: (rect ? r.origin.x - rect.origin.x : r.origin.x) * scale,
            top: (rect ? r.origin.y - rect.origin.y : r.origin.y) * scale,
            width: r.size.width * scale,
            height: r.size.height * scale,
            background: 'transparent',
            pointerEvents: onClick ? 'auto' : 'none',
            cursor: onClick ? 'pointer' : 'default',
            zIndex: onClick ? 1 : 0,
            ...style,
          }}
        >
          {/* Visual squiggly line */}
          <div
            style={{
              position: 'absolute',
              left: 0,
              bottom: 0,
              width: '100%',
              height: amplitude * 2,
              backgroundImage: svgDataUri,
              backgroundRepeat: 'repeat-x',
              backgroundSize: `${period}px ${amplitude * 2}px`,
              opacity: opacity,
              pointerEvents: 'none',
            }}
          />
        </div>
      ))}
    </>
  );
}
