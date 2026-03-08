import { useMemo, MouseEvent } from '@framework';
import { Rect } from '@embedpdf/models';

interface CaretProps {
  /** Whether the annotation is selected */
  isSelected: boolean;
  /** Stroke colour */
  strokeColor?: string;
  /** 0 – 1 */
  opacity?: number;
  /** Bounding box of the annotation (PDF units) */
  rect: Rect;
  /** Current page zoom factor */
  scale: number;
  /** Click handler (used for selection) */
  onClick?: (e: MouseEvent<SVGElement>) => void;
  /** When true, AP canvas provides the visual; only render hit area */
  appearanceActive?: boolean;
}

/**
 * Renders a PDF Caret annotation as an SVG ^ symbol using bezier curves
 * that mirror the C++ appearance stream.
 */
export function Caret({
  isSelected,
  strokeColor = '#000000',
  opacity = 1,
  rect,
  scale,
  onClick,
  appearanceActive = false,
}: CaretProps): JSX.Element {
  const { width, height, path } = useMemo(() => {
    const w = rect.size.width;
    const h = rect.size.height;

    const midX = w / 2;

    const d = [
      `M 0 ${h}`,
      `C ${w * 0.27} ${h} ${midX} ${h - h * 0.44} ${midX} 0`,
      `C ${midX} ${h - h * 0.44} ${w - w * 0.27} ${h} ${w} ${h}`,
      'Z',
    ].join(' ');

    return { width: w, height: h, path: d };
  }, [rect]);

  const svgWidth = width * scale;
  const svgHeight = height * scale;

  return (
    <svg
      style={{
        position: 'absolute',
        width: svgWidth,
        height: svgHeight,
        pointerEvents: 'none',
        zIndex: 2,
      }}
      width={svgWidth}
      height={svgHeight}
      viewBox={`0 0 ${width} ${height}`}
      overflow="visible"
    >
      {/* Hit area */}
      <path
        d={path}
        fill="transparent"
        stroke="transparent"
        strokeWidth={4}
        onPointerDown={onClick}
        style={{
          cursor: isSelected ? 'move' : 'pointer',
          pointerEvents: isSelected ? 'none' : 'visible',
        }}
      />
      {/* Visual */}
      {!appearanceActive && (
        <path
          d={path}
          fill={strokeColor}
          stroke={strokeColor}
          strokeWidth={0.5}
          opacity={opacity}
          fillRule="evenodd"
          style={{ pointerEvents: 'none' }}
        />
      )}
    </svg>
  );
}
