import { CSSProperties, MouseEvent } from '@framework';
import { Quad, Rect } from '@embedpdf/models';

import { quadBoundsRelativeToContainer, quadClipPath, resolveTextMarkupSegments } from './quad-geometry';

type HighlightProps = {
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

export function Highlight({
  strokeColor,
  opacity = 0.5,
  segmentRects,
  segmentQuads,
  rect,
  scale,
  onClick,
  style,
  appearanceActive = false,
}: HighlightProps) {
  const resolvedColor = strokeColor ?? '#FFFF00';
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
              background: appearanceActive ? 'transparent' : resolvedColor,
              opacity: appearanceActive ? undefined : opacity,
              clipPath: appearanceActive ? undefined : quadClipPath(segment, rect, scale),
              pointerEvents: onClick ? 'auto' : 'none',
              cursor: onClick ? 'pointer' : 'default',
              zIndex: onClick ? 1 : undefined,
              ...style,
            }}
          />
        );
      })}
    </>
  );
}
