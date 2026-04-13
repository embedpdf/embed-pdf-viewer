import { Fragment } from '@framework';
import { Rect, PdfAnnotationLineEnding, Position } from '@embedpdf/models';
import { patching } from '@embedpdf/plugin-annotation';

interface CalloutFreeTextPreviewProps {
  calloutLine?: Position[];
  textBox?: Rect;
  bounds: Rect;
  scale: number;
  strokeColor?: string;
  strokeWidth?: number;
  color?: string;
  backgroundColor?: string;
  opacity?: number;
  lineEnding?: PdfAnnotationLineEnding;
}

export function CalloutFreeTextPreview({
  calloutLine,
  textBox,
  bounds,
  scale,
  strokeColor,
  strokeWidth,
  color,
  backgroundColor,
  opacity,
  lineEnding,
}: CalloutFreeTextPreviewProps) {
  if (!calloutLine || calloutLine.length < 2) return <Fragment />;

  const sw = strokeWidth ?? 1;
  const sc = strokeColor ?? '#000000';
  const op = opacity ?? 1;
  const w = bounds.size.width;
  const h = bounds.size.height;
  const ox = bounds.origin.x;
  const oy = bounds.origin.y;

  const lineCoords = calloutLine.map((p) => ({ x: p.x - ox, y: p.y - oy }));
  const angle = Math.atan2(lineCoords[1].y - lineCoords[0].y, lineCoords[1].x - lineCoords[0].x);
  const ending = patching.createEnding(
    lineEnding,
    sw,
    angle + Math.PI,
    lineCoords[0].x,
    lineCoords[0].y,
  );

  const halfSw = sw / 2;

  return (
    <svg
      style={{
        position: 'absolute',
        width: w * scale,
        height: h * scale,
        pointerEvents: 'none',
        overflow: 'visible',
      }}
      width={w * scale}
      height={h * scale}
      viewBox={`0 0 ${w} ${h}`}
    >
      <polyline
        points={lineCoords.map((p) => `${p.x},${p.y}`).join(' ')}
        fill="none"
        stroke={sc}
        strokeWidth={sw}
        opacity={op}
      />
      {ending && (
        <path
          d={ending.d}
          transform={ending.transform}
          stroke={sc}
          fill={ending.filled ? (color ?? 'transparent') : 'none'}
          strokeWidth={sw}
          opacity={op}
        />
      )}
      {textBox && (
        <rect
          x={textBox.origin.x - ox + halfSw}
          y={textBox.origin.y - oy + halfSw}
          width={textBox.size.width - sw}
          height={textBox.size.height - sw}
          fill={color ?? backgroundColor ?? 'transparent'}
          stroke={sc}
          strokeWidth={sw}
          opacity={op}
        />
      )}
    </svg>
  );
}
