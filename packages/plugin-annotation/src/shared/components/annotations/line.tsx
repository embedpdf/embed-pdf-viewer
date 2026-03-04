import { useMemo, MouseEvent } from '@framework';
import { Rect, LinePoints, LineEndings, PdfAnnotationBorderStyle } from '@embedpdf/models';
import { patching } from '@embedpdf/plugin-annotation';

const MIN_HIT_AREA_SCREEN_PX = 20;

interface LineProps {
  /** interior colour */
  color?: string;
  /** 0 – 1 */
  opacity?: number;
  /** Stroke width in PDF units */
  strokeWidth: number;
  /** Stroke colour (falls back to PDFium default black) */
  strokeColor?: string;
  /** Stroke style */
  strokeStyle?: PdfAnnotationBorderStyle;
  /** Stroke dash array */
  strokeDashArray?: number[];
  /** Bounding box of the annotation */
  rect: Rect;
  /** Line start / end points (page units) */
  linePoints: LinePoints;
  /** Line endings (eg. OpenArrow / Butt) */
  lineEndings?: LineEndings;
  /** Current page zoom factor */
  scale: number;
  /** Click handler (used for selection) */
  onClick?: (e: MouseEvent<SVGElement>) => void;
  /** Whether the annotation is selected */
  isSelected: boolean;
  /** When true, AP canvas provides the visual; only render hit area */
  appearanceActive?: boolean;
}

/**
 * Renders a PDF Line annotation as SVG (with arrow/butt endings).
 */
export function Line({
  color = 'transparent',
  opacity = 1,
  strokeWidth,
  strokeColor = '#000000',
  strokeStyle = PdfAnnotationBorderStyle.SOLID,
  strokeDashArray,
  rect,
  linePoints,
  lineEndings,
  scale,
  onClick,
  isSelected,
  appearanceActive = false,
}: LineProps): JSX.Element {
  const { x1, y1, x2, y2 } = useMemo(() => {
    return {
      x1: linePoints.start.x - rect.origin.x,
      y1: linePoints.start.y - rect.origin.y,
      x2: linePoints.end.x - rect.origin.x,
      y2: linePoints.end.y - rect.origin.y,
    };
  }, [linePoints, rect]);

  const endings = useMemo(() => {
    const angle = Math.atan2(y2 - y1, x2 - x1);
    return {
      start: patching.createEnding(lineEndings?.start, strokeWidth, angle + Math.PI, x1, y1),
      end: patching.createEnding(lineEndings?.end, strokeWidth, angle, x2, y2),
    };
  }, [lineEndings, strokeWidth, x1, y1, x2, y2]);

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
      <line
        x1={x1}
        y1={y1}
        x2={x2}
        y2={y2}
        stroke="transparent"
        strokeWidth={hitStrokeWidth}
        onPointerDown={onClick}
        style={{
          cursor: isSelected ? 'move' : 'pointer',
          pointerEvents: isSelected ? 'none' : 'visibleStroke',
          strokeLinecap: 'butt',
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
          <line
            x1={x1}
            y1={y1}
            x2={x2}
            y2={y2}
            opacity={opacity}
            style={{
              pointerEvents: 'none',
              stroke: strokeColor,
              strokeWidth,
              strokeLinecap: 'butt',
              ...(strokeStyle === PdfAnnotationBorderStyle.DASHED && {
                strokeDasharray: strokeDashArray?.join(','),
              }),
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
                ...(strokeStyle === PdfAnnotationBorderStyle.DASHED && {
                  strokeDasharray: strokeDashArray?.join(','),
                }),
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
                ...(strokeStyle === PdfAnnotationBorderStyle.DASHED && {
                  strokeDasharray: strokeDashArray?.join(','),
                }),
              }}
            />
          )}
        </>
      )}
    </svg>
  );
}
