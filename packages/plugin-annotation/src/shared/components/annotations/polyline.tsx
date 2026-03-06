import { MouseEvent, useMemo } from '@framework';
import { Rect, Position, LineEndings } from '@embedpdf/models';
import { patching } from '@embedpdf/plugin-annotation';

const MIN_HIT_AREA_SCREEN_PX = 20;

interface PolylineProps {
  rect: Rect;
  vertices: Position[];
  color?: string;
  strokeColor?: string;
  opacity?: number;
  strokeWidth: number;
  scale: number;
  isSelected: boolean;
  onClick?: (e: MouseEvent<SVGElement>) => void;
  /** Optional start & end endings */
  lineEndings?: LineEndings;
  /** When true, AP canvas provides the visual; only render hit area */
  appearanceActive?: boolean;
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
  appearanceActive = false,
}: PolylineProps): JSX.Element {
  const localPts = useMemo(
    () => vertices.map(({ x, y }) => ({ x: x - rect.origin.x, y: y - rect.origin.y })),
    [vertices, rect],
  );

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

  const endings = useMemo(() => {
    if (localPts.length < 2) return { start: null, end: null };
    const toAngle = (a: Position, b: Position) => Math.atan2(b.y - a.y, b.x - a.x);

    const startRad = toAngle(localPts[0], localPts[1]);
    const endRad = toAngle(localPts[localPts.length - 2], localPts[localPts.length - 1]);

    const start = patching.createEnding(
      lineEndings?.start,
      strokeWidth,
      startRad + Math.PI,
      localPts[0].x,
      localPts[0].y,
    );
    const end = patching.createEnding(
      lineEndings?.end,
      strokeWidth,
      endRad,
      localPts[localPts.length - 1].x,
      localPts[localPts.length - 1].y,
    );
    return { start, end };
  }, [localPts, lineEndings, strokeWidth]);

  const width = rect.size.width * scale;
  const height = rect.size.height * scale;
  const hitStrokeWidth = Math.max(strokeWidth, MIN_HIT_AREA_SCREEN_PX / scale);

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
      {/* Hit area -- always rendered, transparent, wider stroke for mobile */}
      <path
        d={pathData}
        fill="none"
        stroke="transparent"
        strokeWidth={hitStrokeWidth}
        onPointerDown={onClick}
        style={{
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
          fill="transparent"
          stroke="transparent"
          strokeWidth={hitStrokeWidth}
          onPointerDown={onClick}
          style={{
            cursor: isSelected ? 'move' : 'pointer',
            pointerEvents: isSelected ? 'none' : endings.start.filled ? 'visible' : 'visibleStroke',
            strokeLinecap: 'butt',
          }}
        />
      )}
      {endings.end && (
        <path
          d={endings.end.d}
          transform={endings.end.transform}
          fill="transparent"
          stroke="transparent"
          strokeWidth={hitStrokeWidth}
          onPointerDown={onClick}
          style={{
            cursor: isSelected ? 'move' : 'pointer',
            pointerEvents: isSelected ? 'none' : endings.end.filled ? 'visible' : 'visibleStroke',
            strokeLinecap: 'butt',
          }}
        />
      )}

      {/* Visual -- hidden when AP active, never interactive */}
      {!appearanceActive && (
        <>
          <path
            d={pathData}
            opacity={opacity}
            style={{
              fill: 'none',
              stroke: strokeColor ?? color,
              strokeWidth,
              pointerEvents: 'none',
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
              style={{
                pointerEvents: 'none',
                strokeWidth,
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
              style={{
                pointerEvents: 'none',
                strokeWidth,
                strokeLinecap: 'butt',
              }}
            />
          )}
        </>
      )}
    </svg>
  );
}
