import { Position } from '@embedpdf/models';

/** Target on-screen label height in CSS pixels (kept constant across zoom). */
const LABEL_FONT_PX = 12;
const PADDING_X_PX = 5;
const PADDING_Y_PX = 3;
/** Rough average glyph width as a fraction of font size (sans-serif). */
const CHAR_WIDTH_RATIO = 0.6;

interface MeasurementLabelProps {
  /** Pre-formatted label text, e.g. "12.5 cm" or "3.2 m²". */
  text: string;
  /**
   * Label anchor in the SVG's local (viewBox) coordinate space, i.e. page
   * units relative to the annotation rect origin. The label is centered here.
   */
  center: Position;
  /** Current page zoom factor. */
  scale: number;
  /** Text colour. */
  color?: string;
  /** Pill background colour. */
  background?: string;
}

/**
 * A zoom-stable measurement read-out drawn inside a shape's SVG. The SVG
 * viewBox is in page units rendered at `scale`, so sizing everything in
 * `px / scale` keeps the label a constant size on screen regardless of zoom.
 *
 * Shared (Preact) implementation — resolved to React/Preact via the `@framework`
 * alias; Vue and Svelte have their own mirrors.
 */
export function MeasurementLabel({
  text,
  center,
  scale,
  color = '#ffffff',
  background = '#2962FF',
}: MeasurementLabelProps): JSX.Element {
  // Guard against a zero/invalid zoom factor producing Infinity dimensions.
  const safeScale = scale > 0 && Number.isFinite(scale) ? scale : 1;
  const fontSize = LABEL_FONT_PX / safeScale;
  const padX = PADDING_X_PX / safeScale;
  const padY = PADDING_Y_PX / safeScale;
  const boxW = text.length * fontSize * CHAR_WIDTH_RATIO + padX * 2;
  const boxH = fontSize + padY * 2;

  return (
    <g style={{ pointerEvents: 'none' }}>
      <rect
        x={center.x - boxW / 2}
        y={center.y - boxH / 2}
        width={boxW}
        height={boxH}
        rx={padY}
        ry={padY}
        fill={background}
        opacity={0.92}
      />
      <text
        x={center.x}
        y={center.y}
        fill={color}
        fontSize={fontSize}
        textAnchor="middle"
        dominantBaseline="central"
        style={{
          fontFamily: 'system-ui, -apple-system, sans-serif',
          fontWeight: 600,
          userSelect: 'none',
        }}
      >
        {text}
      </text>
    </g>
  );
}
