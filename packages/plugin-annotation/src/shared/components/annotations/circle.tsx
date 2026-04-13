import { useMemo, MouseEvent } from '@framework';
import { PdfAnnotationBorderStyle, PdfRectDifferences, Rect } from '@embedpdf/models';
import { generateCloudyEllipsePath } from '@embedpdf/plugin-annotation';

const MIN_HIT_AREA_SCREEN_PX = 20;

interface CircleProps {
  /** Whether the annotation is selected */
  isSelected: boolean;
  /** Fill colour – defaults to PDFium's black if omitted */
  color?: string;
  /** Stroke colour – defaults to same as fill when omitted */
  strokeColor?: string;
  /** 0 – 1 */
  opacity?: number;
  /** Stroke width in PDF units */
  strokeWidth: number;
  /** Stroke type – defaults to solid when omitted */
  strokeStyle?: PdfAnnotationBorderStyle;
  /** Stroke dash array – defaults to undefined when omitted */
  strokeDashArray?: number[];
  /** Bounding box of the annotation */
  rect: Rect;
  /** Current page zoom factor */
  scale: number;
  /** Click handler (used for selection) */
  onClick?: (e: MouseEvent<SVGElement>) => void;
  /** When true, AP canvas provides the visual; only render hit area */
  appearanceActive?: boolean;
  /** Cloudy border intensity (0 = no cloud, typically 1 or 2) */
  cloudyBorderIntensity?: number;
  /** Rectangle differences – inset from Rect to drawn area */
  rectangleDifferences?: PdfRectDifferences;
}

/**
 * Renders a PDF Circle annotation (ellipse) as SVG.
 */
export function Circle({
  color = '#000000',
  strokeColor,
  opacity = 1,
  strokeWidth,
  strokeStyle = PdfAnnotationBorderStyle.SOLID,
  strokeDashArray,
  rect,
  scale,
  onClick,
  isSelected,
  appearanceActive = false,
  cloudyBorderIntensity,
  rectangleDifferences,
}: CircleProps): JSX.Element {
  const isCloudy = (cloudyBorderIntensity ?? 0) > 0;

  const { width, height, cx, cy, rx, ry } = useMemo(() => {
    const outerW = rect.size.width;
    const outerH = rect.size.height;
    const innerW = Math.max(outerW - strokeWidth, 0);
    const innerH = Math.max(outerH - strokeWidth, 0);

    return {
      width: outerW,
      height: outerH,
      cx: strokeWidth / 2 + innerW / 2,
      cy: strokeWidth / 2 + innerH / 2,
      rx: innerW / 2,
      ry: innerH / 2,
    };
  }, [rect, strokeWidth]);

  const cloudyPath = useMemo(() => {
    if (!isCloudy) return null;
    return generateCloudyEllipsePath(
      { x: 0, y: 0, width: rect.size.width, height: rect.size.height },
      rectangleDifferences,
      cloudyBorderIntensity!,
      strokeWidth,
    );
  }, [isCloudy, rect, rectangleDifferences, cloudyBorderIntensity, strokeWidth]);

  const svgWidth = width * scale;
  const svgHeight = height * scale;
  const hitStrokeWidth = Math.max(strokeWidth, MIN_HIT_AREA_SCREEN_PX / scale);

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
      {/* Hit area -- always rendered, transparent, wider stroke for mobile */}
      {isCloudy && cloudyPath ? (
        <path
          d={cloudyPath.path}
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
          }}
        />
      ) : (
        <ellipse
          cx={cx}
          cy={cy}
          rx={rx}
          ry={ry}
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
          }}
        />
      )}
      {/* Visual -- hidden when AP active, never interactive */}
      {!appearanceActive &&
        (isCloudy && cloudyPath ? (
          <path
            d={cloudyPath.path}
            fill={color}
            opacity={opacity}
            style={{
              pointerEvents: 'none',
              stroke: strokeColor ?? color,
              strokeWidth,
              strokeLinejoin: 'round',
            }}
          />
        ) : (
          <ellipse
            cx={cx}
            cy={cy}
            rx={rx}
            ry={ry}
            fill={color}
            opacity={opacity}
            style={{
              pointerEvents: 'none',
              stroke: strokeColor ?? color,
              strokeWidth,
              ...(strokeStyle === PdfAnnotationBorderStyle.DASHED && {
                strokeDasharray: strokeDashArray?.join(','),
              }),
            }}
          />
        ))}
    </svg>
  );
}
