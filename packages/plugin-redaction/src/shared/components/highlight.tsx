import { HTMLAttributes, CSSProperties, MouseEvent, TouchEvent } from '@framework';
import { Rect } from '@embedpdf/models';

type HighlightProps = Omit<HTMLAttributes<HTMLDivElement>, 'style'> & {
  color?: string;
  opacity?: number;
  border?: string;
  rects: Rect[];
  rect?: Rect;
  scale: number;
  onClick?: (e: MouseEvent<HTMLDivElement> | TouchEvent<HTMLDivElement>) => void;
  style?: CSSProperties;
};

export function Highlight({
  color = '#FFFF00',
  opacity = 1,
  border = '1px solid red',
  rects,
  rect,
  scale,
  onClick,
  style,
  ...props
}: HighlightProps) {
  return (
    <>
      {rects.map((b, i) => (
        <div
          key={i}
          onPointerDown={onClick}
          onTouchStart={onClick}
          style={{
            position: 'absolute',
            border,
            left: (rect ? b.origin.x - rect.origin.x : b.origin.x) * scale,
            top: (rect ? b.origin.y - rect.origin.y : b.origin.y) * scale,
            width: b.size.width * scale,
            height: b.size.height * scale,
            background: color,
            opacity: opacity,
            pointerEvents: onClick ? 'auto' : 'none',
            cursor: onClick ? 'pointer' : 'default',
            zIndex: onClick ? 1 : undefined,
            ...style,
          }}
          {...props}
        />
      ))}
    </>
  );
}
