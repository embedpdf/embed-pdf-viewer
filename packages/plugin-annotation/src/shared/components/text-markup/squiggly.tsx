import { CSSProperties, MouseEvent } from '@framework';
import { Quad, Rect } from '@embedpdf/models';

import {
  quadBoundsRelativeToContainer,
  resolveTextMarkupSegments,
  squigglySegmentPath,
} from './quad-geometry';

type SquigglyProps = {
  /** Stroke/markup color */
  strokeColor?: string;
  opacity?: number;
  segmentRects: Rect[];
  segmentQuads?: Quad[];
  rect?: Rect;
  scale: number;
  onClick?: (e: MouseEvent<HTMLDivElement>) => void;
  style?: CSSProperties;
  /** When true, AP image provides the visual; only render hit area */
  appearanceActive?: boolean;
};

export function Squiggly({
  strokeColor,
  opacity = 0.5,
  segmentRects,
  segmentQuads,
  rect,
  scale,
  onClick,
  style,
  appearanceActive = false,
}: SquigglyProps) {
  const resolvedColor = strokeColor ?? '#FFFF00';
  const thickness = 2 * scale;
  const segments = resolveTextMarkupSegments(segmentRects, segmentQuads);

  return (
    <>
      {segments.map((segment, i) => {
        const bounds = quadBoundsRelativeToContainer(segment, rect, scale);
        return (
          <div
            key={i}
            onPointerDown={onClick}
            style={{
              position: 'absolute',
              left: bounds.left,
              top: bounds.top,
              width: bounds.width,
              height: bounds.height,
              background: 'transparent',
              pointerEvents: onClick ? 'auto' : 'none',
              cursor: onClick ? 'pointer' : 'default',
              zIndex: onClick ? 1 : 0,
              ...style,
            }}
          >
            {!appearanceActive && (
              <svg
                style={{
                  position: 'absolute',
                  left: 0,
                  top: 0,
                  width: '100%',
                  height: '100%',
                  overflow: 'visible',
                  pointerEvents: 'none',
                }}
              >
                <path
                  d={squigglySegmentPath(segment, rect, scale, 2 * scale, 6 * scale)}
                  stroke={resolvedColor}
                  strokeWidth={thickness}
                  fill="none"
                  opacity={opacity}
                />
              </svg>
            )}
          </div>
        );
      })}
    </>
  );
}
