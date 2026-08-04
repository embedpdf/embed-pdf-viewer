import { useMemo, MouseEvent } from '@framework';
import {
  Rect,
  Position,
  PdfAnnotationBorderStyle,
  PdfMeasurementInfo,
  formatMeasurement,
  polygonArea,
  polygonPerimeter,
} from '@embedpdf/models';
import { generateCloudyPolygonPath } from '@embedpdf/plugin-annotation';
import { MeasurementLabel } from './measurement-label';
import { AreaHatch } from './area-hatch';

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
  /** Cloudy border intensity (0 = no cloud, typically 1 or 2) */
  cloudyBorderIntensity?: number;
  /** Measurement metadata; when present an area/perimeter label is drawn. */
  measurement?: PdfMeasurementInfo;
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
  cloudyBorderIntensity,
  measurement,
}: PolygonProps): JSX.Element {
  const isCloudy = (cloudyBorderIntensity ?? 0) > 0;
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

  const cloudyPath = useMemo(() => {
    if (!isCloudy || allPoints.length < 3) return null;
    return generateCloudyPolygonPath(allPoints, rect.origin, cloudyBorderIntensity!, strokeWidth);
  }, [isCloudy, allPoints, rect.origin, cloudyBorderIntensity, strokeWidth]);

  const isPreviewing = currentVertex && vertices.length > 0;

  const measure = useMemo(() => {
    // A polygon needs >= 3 points to be meaningful; skip the label while the
    // rubber-band preview still has fewer (avoids a nonsensical 2-point value).
    if (!measurement || localPts.length === 0 || (currentVertex && allPoints.length < 3))
      return null;
    const value =
      measurement.mode === 'perimeter' ? polygonPerimeter(allPoints) : polygonArea(allPoints);
    const center = localPts.reduce(
      (acc, p) => ({ x: acc.x + p.x / localPts.length, y: acc.y + p.y / localPts.length }),
      { x: 0, y: 0 },
    );
    return { text: formatMeasurement(value, measurement), center };
  }, [measurement, allPoints, localPts]);

  // Area measurements get a light diagonal-hatch fill to mark the region.
  const isAreaMeasure = measurement?.mode === 'area';
  const hatchId = useMemo(() => 'mhatch-' + Math.random().toString(36).slice(2, 9), []);
  const hatchColor = strokeColor ?? '#2962FF';
  const hatchUrl = `url(#${hatchId})`;

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
        d={isCloudy && cloudyPath ? cloudyPath.path : pathData}
        fill="transparent"
        stroke="transparent"
        strokeWidth={hitStrokeWidth}
        onPointerDown={onClick}
        style={{
          cursor: isSelected ? 'move' : onClick ? 'pointer' : 'default',
          pointerEvents: !onClick
            ? 'none'
            : isSelected
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
          {isAreaMeasure && <AreaHatch id={hatchId} color={hatchColor} scale={scale} />}
          {isCloudy && cloudyPath ? (
            <path
              d={cloudyPath.path}
              opacity={opacity}
              style={{
                fill: isAreaMeasure ? hatchUrl : color,
                stroke: strokeColor ?? color,
                strokeWidth,
                pointerEvents: 'none',
                strokeLinejoin: 'round',
              }}
            />
          ) : (
            <>
              <path
                d={pathData}
                opacity={opacity}
                style={{
                  fill: currentVertex ? 'none' : isAreaMeasure ? hatchUrl : color,
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
        </>
      )}

      {measure && (
        <MeasurementLabel
          text={measure.text}
          center={measure.center}
          scale={scale}
          background={strokeColor}
        />
      )}
    </svg>
  );
}
