import { CSSProperties, MouseEvent } from '@framework';
import { Rect } from '@embedpdf/models';

type StrikeoutProps = {
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

export function Strikeout({
  strokeColor,
  opacity = 0.5,
  segmentRects,
  rect,
  scale,
  onClick,
  style,
  appearanceActive = false,
}: StrikeoutProps) {
  const resolvedColor = strokeColor ?? '#FFFF00';
  const thickness = 2 * scale;

  return (
    <>
      {segmentRects.map((r, i) => (
        <div
          key={i}
          onPointerDown={onClick}
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
          {/* Visual -- hidden when AP active, never interactive */}
          {!appearanceActive && (
            <div
              style={{
                position: 'absolute',
                left: 0,
                top: '50%',
                width: '100%',
                height: thickness,
                background: resolvedColor,
                opacity: opacity,
                transform: 'translateY(-50%)',
                pointerEvents: 'none',
              }}
            />
          )}
        </div>
      ))}
    </>
  );
}
