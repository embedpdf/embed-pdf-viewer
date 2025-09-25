import { MouseEvent, TouchEvent, useMemo } from '@framework';
import { Rect, Position, LineEndings } from '@embedpdf/models';
import { patching } from '@embedpdf/plugin-annotation';

interface PolylineProps {
  rect: Rect;
  vertices: Position[];
  color?: string;
  strokeColor?: string;
  opacity?: number;
  strokeWidth: number;
  scale: number;
  isSelected: boolean;
  onClick?: (e: MouseEvent<SVGElement> | TouchEvent<SVGElement>) => void;
  /** Optional start & end endings */
  lineEndings?: LineEndings;
}

export function Polyline({
  rect,
  vertices,
  color = 'transparent',
  strokeColor = '#000000',
  opacity = 1,
  strokeWidth,
  scale,
  isSelected,
  onClick,
  lineEndings,
}: PolylineProps): JSX.Element {
  // Localise vertices to annotation rect
  const localPts = useMemo(
    () => vertices.map(({ x, y }) => ({ x: x - rect.origin.x, y: y - rect.origin.y })),
    [vertices, rect],
  );

  // Build path data "M x0 y0 L x1 y1 ..."
  const pathData = useMemo(() => {
    if (!localPts.length) return '';
    const [first, ...rest] = localPts;
    return (
      `M ${first.x} ${first.y} ` +
      rest
        .map((p) => `L ${p.x} ${p.y} `)
        .join('')
        .trim()
    );
  }, [localPts]);

  // Compute endings (angles from first→second, last-1→last)
  const endings = useMemo(() => {
    if (localPts.length < 2) return { start: null, end: null };
    const toAngle = (a: Position, b: Position) => Math.atan2(b.y - a.y, b.x - a.x);

    // Calculate angles in the direction of the line segments
    const startRad = toAngle(localPts[0], localPts[1]); // direction FROM first TO second
    const endRad = toAngle(localPts[localPts.length - 2], localPts[localPts.length - 1]); // direction FROM second-to-last TO last

    const start = patching.createEnding(
      lineEndings?.start,
      strokeWidth,
      startRad + Math.PI, // tip points outward from line start
      localPts[0].x,
      localPts[0].y,
    );
    const end = patching.createEnding(
      lineEndings?.end,
      strokeWidth,
      endRad, // tip points in line direction
      localPts[localPts.length - 1].x,
      localPts[localPts.length - 1].y,
    );
    return { start, end };
  }, [localPts, lineEndings, strokeWidth]);

  const width = rect.size.width * scale;
  const height = rect.size.height * scale;

  return (
    <svg
      style={{
        position: 'absolute',
        width,
        height,
        pointerEvents: 'none',
        zIndex: 2,
        overflow: 'visible',
      }}
      width={width}
      height={height}
      viewBox={`0 0 ${rect.size.width} ${rect.size.height}`}
    >
      <path
        d={pathData}
        onPointerDown={onClick}
        onTouchStart={onClick}
        opacity={opacity}
        style={{
          fill: 'none',
          stroke: strokeColor ?? color,
          strokeWidth,
          cursor: isSelected ? 'move' : 'pointer',
          pointerEvents: isSelected ? 'none' : 'visibleStroke',
          strokeLinecap: 'butt',
          strokeLinejoin: 'miter',
        }}
      />
      {endings.start && (
        <path
          d={endings.start.d}
          transform={endings.start.transform}
          stroke={strokeColor}
          fill={endings.start.filled ? color : 'none'}
          onPointerDown={onClick}
          onTouchStart={onClick}
          style={{
            cursor: isSelected ? 'move' : 'pointer',
            strokeWidth,
            pointerEvents: isSelected ? 'none' : endings.start.filled ? 'visible' : 'visibleStroke',
            strokeLinecap: 'butt',
          }}
        />
      )}
      {endings.end && (
        <path
          d={endings.end.d}
          transform={endings.end.transform}
          stroke={strokeColor}
          fill={endings.end.filled ? color : 'none'}
          onPointerDown={onClick}
          onTouchStart={onClick}
          style={{
            cursor: isSelected ? 'move' : 'pointer',
            strokeWidth,
            pointerEvents: isSelected ? 'none' : endings.end.filled ? 'visible' : 'visibleStroke',
            strokeLinecap: 'butt',
          }}
        />
      )}
    </svg>
  );
}
