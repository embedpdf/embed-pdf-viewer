import { useMemo, MouseEvent, TouchEvent } from '@framework';
import { PdfAnnotationBorderStyle, Rect } from '@embedpdf/models';

/* ---------------------------------------------------------------- *\
|* Types                                                            *|
\* ---------------------------------------------------------------- */

interface LinkProps {
  /** Whether the annotation is selected */
  isSelected: boolean;
  /** Stroke colour – defaults to blue when omitted */
  strokeColor?: string;
  /** Stroke width in PDF units */
  strokeWidth?: number;
  /** Stroke type – defaults to underline when omitted */
  strokeStyle?: PdfAnnotationBorderStyle;
  /** Stroke dash array – for dashed style */
  strokeDashArray?: number[];
  /** Bounding box of the annotation (PDF units) */
  rect: Rect;
  /** Current page zoom factor */
  scale: number;
  /** Click handler (used for selection) */
  onClick?: (e: MouseEvent<SVGElement> | TouchEvent<SVGElement>) => void;
  /** Whether this link has an IRT (In Reply To) reference - disables direct interaction */
  hasIRT?: boolean;
}

/**
 * Renders a PDF Link annotation as SVG.
 * Supports underline (default), solid, and dashed border styles.
 */
export function Link({
  isSelected,
  strokeColor = '#0000FF',
  strokeWidth = 2,
  strokeStyle = PdfAnnotationBorderStyle.UNDERLINE,
  strokeDashArray,
  rect,
  scale,
  onClick,
  hasIRT = false,
}: LinkProps): JSX.Element {
  const { width, height } = useMemo(() => {
    return {
      width: rect.size.width,
      height: rect.size.height,
    };
  }, [rect]);

  const svgWidth = width * scale;
  const svgHeight = height * scale;

  // Calculate dash array for SVG
  const dashArray = useMemo(() => {
    if (strokeStyle === PdfAnnotationBorderStyle.DASHED) {
      return strokeDashArray?.join(',') ?? `${strokeWidth * 3},${strokeWidth}`;
    }
    return undefined;
  }, [strokeStyle, strokeDashArray, strokeWidth]);

  // For underline style, render a line at the bottom
  // For solid/dashed, render a rectangle border
  const isUnderline = strokeStyle === PdfAnnotationBorderStyle.UNDERLINE;

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
    >
      {/* Invisible hit area for the entire link region */}
      {/* IRT links are not directly clickable - interaction goes through parent */}
      <rect
        x={0}
        y={0}
        width={width}
        height={height}
        fill="transparent"
        onPointerDown={hasIRT ? undefined : onClick}
        onTouchStart={hasIRT ? undefined : onClick}
        style={{
          cursor: hasIRT ? 'default' : isSelected ? 'move' : 'pointer',
          pointerEvents: hasIRT ? 'none' : isSelected ? 'none' : 'visible',
        }}
      />

      {isUnderline ? (
        // Underline style: line at bottom of rect
        <line
          x1={1}
          y1={height - 1}
          x2={width - 1}
          y2={height - 1}
          stroke={strokeColor}
          strokeWidth={strokeWidth}
          strokeDasharray={dashArray}
          style={{
            pointerEvents: 'none',
          }}
        />
      ) : (
        // Solid/Dashed style: rectangle border
        <rect
          x={strokeWidth / 2}
          y={strokeWidth / 2}
          width={Math.max(width - strokeWidth, 0)}
          height={Math.max(height - strokeWidth, 0)}
          fill="transparent"
          stroke={strokeColor}
          strokeWidth={strokeWidth}
          strokeDasharray={dashArray}
          style={{
            pointerEvents: 'none',
          }}
        />
      )}
    </svg>
  );
}
