/** On-screen spacing/line-weight of the area hatch, kept constant across zoom. */
const HATCH_SPACING_PX = 7;
const HATCH_LINE_PX = 1;
const HATCH_OPACITY = 0.4;

interface AreaHatchProps {
  /** Unique pattern id (referenced as `fill="url(#id)"` by the shape). */
  id: string;
  /** Hatch line colour (usually the measurement stroke colour). */
  color: string;
  /** Current page zoom factor. */
  scale: number;
}

/**
 * SVG `<defs>` holding a light 45° diagonal hatch pattern, used to fill area
 * measurement shapes (rectangle/ellipse/polygon) so the enclosed region reads
 * as "the area being measured". Sized in `px / scale` so the hatch density
 * stays visually constant as the user zooms.
 *
 * Shared (Preact) implementation; Vue and Svelte have mirrors.
 */
export function AreaHatch({ id, color, scale }: AreaHatchProps): JSX.Element {
  const s = scale > 0 ? scale : 1;
  const spacing = HATCH_SPACING_PX / s;
  const lineW = HATCH_LINE_PX / s;

  return (
    <defs>
      <pattern
        id={id}
        patternUnits="userSpaceOnUse"
        width={spacing}
        height={spacing}
        patternTransform="rotate(45)"
      >
        <line x1={0} y1={0} x2={0} y2={spacing} stroke={color} strokeWidth={lineW} opacity={HATCH_OPACITY} />
      </pattern>
    </defs>
  );
}
