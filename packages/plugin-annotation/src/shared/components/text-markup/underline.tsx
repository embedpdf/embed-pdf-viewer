import { CSSProperties, MouseEvent, TouchEvent } from '@framework';
import { Rect } from '@embedpdf/models';

type UnderlineProps = {
  color?: string;
  opacity?: number;
  segmentRects: Rect[];
  rect?: Rect;
  scale: number;
  onClick?: (e: MouseEvent<HTMLDivElement> | TouchEvent<HTMLDivElement>) => void;
  style?: CSSProperties;
};

export function Underline({
  color = '#FFFF00',
  opacity = 0.5,
  segmentRects,
  rect,
  scale,
  onClick,
  style,
}: UnderlineProps) {
  const thickness = 2 * scale; // 2 CSS px at 100 % zoom

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
          {/* Visual underline */}
          <div
            style={{
              position: 'absolute',
              left: 0,
              bottom: 0,
              width: '100%',
              height: thickness,
              background: color,
              opacity: opacity,
              pointerEvents: 'none',
            }}
          />
        </div>
      ))}
    </>
  );
}
