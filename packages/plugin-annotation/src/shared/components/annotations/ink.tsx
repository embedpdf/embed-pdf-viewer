import { useMemo, MouseEvent, TouchEvent } from '@framework';
import { PdfInkListObject, Rect } from '@embedpdf/models';

const MIN_HIT_AREA_SCREEN_PX = 20;

interface InkProps {
  /** Whether the annotation is selected */
  isSelected: boolean;
  /** Stroke color */
  strokeColor?: string;
  /** 0 – 1 */
  opacity?: number;
  /** Line width in PDF units */
  strokeWidth: number;
  /** Array of strokes — exactly as in your JSON */
  inkList: PdfInkListObject[];
  /** Bounding box of the whole annotation */
  rect: Rect;
  /** Page zoom factor */
  scale: number;
  /** Callback for when the annotation is clicked */
  onClick?: (e: MouseEvent<SVGPathElement> | TouchEvent<SVGPathElement>) => void;
  /** When true, AP canvas provides the visual; only render hit area */
  appearanceActive?: boolean;
}

/**
 * Renders a PDF Ink annotation (free-hand drawing) as SVG.
 */
export function Ink({
  isSelected,
  strokeColor,
  opacity = 1,
  strokeWidth,
  inkList,
  rect,
  scale,
  onClick,
  appearanceActive = false,
}: InkProps): JSX.Element {
  const resolvedColor = strokeColor ?? '#000000';

  const paths = useMemo(() => {
    return inkList.map(({ points }) => {
      let d = '';
      points.forEach(({ x, y }, i) => {
        const lx = x - rect.origin.x;
        const ly = y - rect.origin.y;
        d += (i === 0 ? 'M' : 'L') + lx + ' ' + ly + ' ';
      });
      return d.trim();
    });
  }, [inkList, rect]);

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
      {paths.map((d, i) => (
        <path
          key={`hit-${i}`}
          d={d}
          fill="none"
          stroke="transparent"
          strokeWidth={hitStrokeWidth}
          onPointerDown={onClick}
          onTouchStart={onClick}
          style={{
            cursor: isSelected ? 'move' : 'pointer',
            pointerEvents: isSelected ? 'none' : 'visibleStroke',
            strokeLinecap: 'round',
            strokeLinejoin: 'round',
          }}
        />
      ))}
      {/* Visual -- hidden when AP active, never interactive */}
      {!appearanceActive &&
        paths.map((d, i) => (
          <path
            key={`vis-${i}`}
            d={d}
            fill="none"
            opacity={opacity}
            style={{
              pointerEvents: 'none',
              stroke: resolvedColor,
              strokeWidth: strokeWidth,
              strokeLinecap: 'round',
              strokeLinejoin: 'round',
            }}
          />
        ))}
    </svg>
  );
}
