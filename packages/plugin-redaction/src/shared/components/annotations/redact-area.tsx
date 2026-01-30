import { CSSProperties, MouseEvent, TouchEvent, useState } from '@framework';
import {
  PdfRedactAnnoObject,
  PdfStandardFont,
  PdfTextAlignment,
  standardFontCss,
  textAlignmentToCss,
} from '@embedpdf/models';
import { TrackedAnnotation } from '@embedpdf/plugin-annotation';

export interface RedactAreaProps {
  annotation: TrackedAnnotation<PdfRedactAnnoObject>;
  isSelected: boolean;
  scale: number;
  pageIndex: number;
  onClick: (e: MouseEvent<Element> | TouchEvent<Element>) => void;
  style?: CSSProperties;
}

/**
 * Renders an area-based redact annotation (marquee redaction).
 * Default: shows strokeColor (C) border only, no fill.
 * Hovered: shows redaction preview with color (IC) as background fill + overlayText.
 * Selected: no border (AnnotationContainer handles selection styling).
 */
export function RedactArea({ annotation, isSelected, scale, onClick, style }: RedactAreaProps) {
  const [isHovered, setIsHovered] = useState(false);
  const { object } = annotation;

  // C - Border/stroke color
  const strokeColor = object.strokeColor ?? '#FF0000';
  // IC - Interior color (background fill when redaction is applied)
  const color = object.color ?? '#000000';
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
      onPointerDown={onClick}
      onTouchStart={onClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        position: 'absolute',
        inset: 0,
        // Default: transparent background with strokeColor (C) border
        // Hovered: color (IC) background fill, no border
        // Selected: no border (container handles it)
        background: isHovered ? color : 'transparent',
        border: !isHovered ? `2px solid ${strokeColor}` : 'none',
        boxSizing: 'border-box',
        cursor: 'pointer',
        pointerEvents: isSelected ? 'none' : 'auto',
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
            fontSize: fontSize * scale,
            fontFamily: standardFontCss(fontFamily),
            textAlign: textAlignmentToCss(textAlign),
            whiteSpace: overlayTextRepeat ? 'normal' : 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            padding: '4px',
          }}
        >
          {renderOverlayText()}
        </span>
      )}
    </div>
  );
}
