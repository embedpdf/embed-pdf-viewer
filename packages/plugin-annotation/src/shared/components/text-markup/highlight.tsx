import { CSSProperties, MouseEvent } from '@framework';
import { Rect } from '@embedpdf/models';

type HighlightProps = {
  /** Stroke/markup color */
  strokeColor?: string;
  opacity?: number;
  segmentRects: Rect[];
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
  rect,
  scale,
  onClick,
  style,
  appearanceActive = false,
}: HighlightProps) {
  const resolvedColor = strokeColor ?? '#FFFF00';

  return (
    <>
      {segmentRects.map((b, i) => (
        <div
          key={i}
          onPointerDown={onClick}
          style={{
            position: 'absolute',
            left: (rect ? b.origin.x - rect.origin.x : b.origin.x) * scale,
            top: (rect ? b.origin.y - rect.origin.y : b.origin.y) * scale,
            width: b.size.width * scale,
            height: b.size.height * scale,
            background: appearanceActive ? 'transparent' : resolvedColor,
            opacity: appearanceActive ? undefined : opacity,
            pointerEvents: onClick ? 'auto' : 'none',
            cursor: onClick ? 'pointer' : 'default',
            zIndex: onClick ? 1 : undefined,
            ...style,
          }}
        />
      ))}
    </>
  );
}
