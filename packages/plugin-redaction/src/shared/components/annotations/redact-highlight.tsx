import { CSSProperties, MouseEvent, TouchEvent, useState } from '@framework';
import {
  PdfRedactAnnoObject,
  PdfStandardFont,
  PdfTextAlignment,
  Rect,
  standardFontCssProperties,
  textAlignmentToCss,
} from '@embedpdf/models';
import { TrackedAnnotation } from '@embedpdf/plugin-annotation';

export interface RedactHighlightProps {
  annotation: TrackedAnnotation<PdfRedactAnnoObject>;
  isSelected: boolean;
  scale: number;
  pageIndex: number;
  onClick: (e: MouseEvent<Element> | TouchEvent<Element>) => void;
  style?: CSSProperties;
}

/**
 * Renders a text-based redact annotation using QuadPoints/segmentRects.
 * Default: shows strokeColor (C) border only, no fill.
 * Hovered: shows redaction preview with color (IC) as background fill + overlayText.
 * Selected: no border (AnnotationContainer handles selection styling).
 */
export function RedactHighlight({
  annotation,
  isSelected,
  scale,
  onClick,
  style,
}: RedactHighlightProps) {
  const [isHovered, setIsHovered] = useState(false);
  const { object } = annotation;

  const segmentRects = object.segmentRects ?? [];
  const rect = object.rect;

  // C - Border/stroke color
  const strokeColor = object.strokeColor ?? '#FF0000';
  // IC - Interior color (background fill when redaction is applied)
  const color = object.color ?? '#000000';
  // CA - Opacity (0-1)
  const opacity = object.opacity ?? 1;
  // OC - Overlay text color (Adobe extension), fallback to fontColor
  const textColor = object.fontColor ?? object.overlayColor ?? '#FFFFFF';
  // Overlay text properties
  const overlayText = object.overlayText;
  const overlayTextRepeat = object.overlayTextRepeat ?? false;
  const fontSize = object.fontSize ?? 12;
  const fontFamily = object.fontFamily ?? PdfStandardFont.Helvetica;
  const textAlign = object.textAlign ?? PdfTextAlignment.Center;

  // Calculate how many times to repeat text (approximate)
  const renderOverlayText = () => {
    if (!overlayText) return null;
    if (!overlayTextRepeat) return overlayText;
    // Repeat text multiple times to fill the space
    const reps = 10; // Enough repetitions to fill most containers
    return Array(reps).fill(overlayText).join(' ');
  };

  return (
    <div
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{ position: 'absolute', inset: 0 }}
    >
      {segmentRects.map((b: Rect, i: number) => (
        <div
          key={i}
          onPointerDown={onClick}
          onTouchStart={onClick}
          style={{
            position: 'absolute',
            left: (rect ? b.origin.x - rect.origin.x : b.origin.x) * scale,
            top: (rect ? b.origin.y - rect.origin.y : b.origin.y) * scale,
            width: b.size.width * scale,
            height: b.size.height * scale,
            // Default: transparent background with strokeColor (C) border
            // Hovered: color (IC) background fill, no border
            // Selected: no border (container handles it)
            background: isHovered ? color : 'transparent',
            border: !isHovered ? `2px solid ${strokeColor}` : 'none',
            opacity: isHovered ? opacity : 1,
            boxSizing: 'border-box',
            pointerEvents: 'auto',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent:
              textAlign === PdfTextAlignment.Left
                ? 'flex-start'
                : textAlign === PdfTextAlignment.Right
                  ? 'flex-end'
                  : 'center',
            overflow: 'hidden',
            ...style,
          }}
        >
          {isHovered && overlayText && (
            <span
              style={{
                color: textColor,
                fontSize: Math.min(fontSize * scale, b.size.height * scale * 0.8),
                ...standardFontCssProperties(fontFamily),
                textAlign: textAlignmentToCss(textAlign),
                whiteSpace: overlayTextRepeat ? 'normal' : 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                lineHeight: 1,
              }}
            >
              {renderOverlayText()}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}
