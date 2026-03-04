import { useMemo, MouseEvent } from '@framework';
import { Rect, Position, PdfAnnotationBorderStyle } from '@embedpdf/models';

const MIN_HIT_AREA_SCREEN_PX = 20;

interface PolygonProps {
  rect: Rect;
  vertices: Position[];
  color?: string;
  strokeColor?: string;
  opacity?: number;
  strokeWidth: number;
  strokeStyle?: PdfAnnotationBorderStyle;
  strokeDashArray?: number[];
  scale: number;
  isSelected: boolean;
  onClick?: (e: MouseEvent<SVGElement>) => void;
  currentVertex?: Position;
  handleSize?: number;
  /** When true, AP canvas provides the visual; only render hit area */
  appearanceActive?: boolean;
}

export function Polygon({
  rect,
  vertices,
  color = 'transparent',
  strokeColor = '#000000',
  opacity = 1,
  strokeWidth,
  strokeStyle = PdfAnnotationBorderStyle.SOLID,
  strokeDashArray,
  scale,
  isSelected,
  onClick,
  currentVertex,
  handleSize = 14,
  appearanceActive = false,
}: PolygonProps): JSX.Element {
  const allPoints = currentVertex ? [...vertices, currentVertex] : vertices;

  const localPts = useMemo(
    () => allPoints.map(({ x, y }) => ({ x: x - rect.origin.x, y: y - rect.origin.y })),
    [allPoints, rect],
  );

  const pathData = useMemo(() => {
    if (!localPts.length) return '';
    const [first, ...rest] = localPts;
    const isPreview = !!currentVertex;
    return (
      `M ${first.x} ${first.y} ` +
      rest.map((p) => `L ${p.x} ${p.y}`).join(' ') +
      (isPreview ? '' : ' Z')
    ).trim();
  }, [localPts, currentVertex]);

  const isPreviewing = currentVertex && vertices.length > 0;

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
        fill="transparent"
        stroke="transparent"
        strokeWidth={hitStrokeWidth}
        onPointerDown={onClick}
        style={{
          cursor: isSelected ? 'move' : 'pointer',
          pointerEvents: isSelected
            ? 'none'
            : color === 'transparent'
              ? 'visibleStroke'
              : 'visible',
          strokeLinecap: 'butt',
          strokeLinejoin: 'miter',
        }}
      />

      {/* Visual -- hidden when AP active, never interactive */}
      {!appearanceActive && (
        <>
          <path
            d={pathData}
            opacity={opacity}
            style={{
              fill: currentVertex ? 'none' : color,
              stroke: strokeColor ?? color,
              strokeWidth,
              pointerEvents: 'none',
              strokeLinecap: 'butt',
              strokeLinejoin: 'miter',
              ...(strokeStyle === PdfAnnotationBorderStyle.DASHED && {
                strokeDasharray: strokeDashArray?.join(','),
              }),
            }}
          />
          {isPreviewing && vertices.length > 1 && (
            <path
              d={`M ${localPts[localPts.length - 1].x} ${localPts[localPts.length - 1].y} L ${localPts[0].x} ${localPts[0].y}`}
              fill="none"
              style={{
                stroke: strokeColor,
                strokeWidth,
                strokeDasharray: '4,4',
                opacity: 0.7,
                pointerEvents: 'none',
              }}
            />
          )}
          {isPreviewing && vertices.length >= 2 && (
            <rect
              x={localPts[0].x - handleSize / scale / 2}
              y={localPts[0].y - handleSize / scale / 2}
              width={handleSize / scale}
              height={handleSize / scale}
              fill={strokeColor}
              opacity={0.4}
              stroke={strokeColor}
              strokeWidth={strokeWidth / 2}
              style={{ pointerEvents: 'none' }}
            />
          )}
        </>
      )}
    </svg>
  );
}
