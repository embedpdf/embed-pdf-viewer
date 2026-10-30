/**
 * How the box the `zoom` tool drags looks: the stage's `zoomBox` setting, the
 * accent its colors follow, and the `--epdf-zoom-box-*` variables that win
 * over both. Dashed like the annotation marquee, so every box you drag reads
 * the same.
 */
import { mixAccent, paint } from './theme';

/** The stage's `zoomBox` setting: a `null` color follows the accent. */
export interface ZoomBoxColors {
  readonly fill: string | null;
  readonly stroke: string | null;
}

/** The SVG dash array of the box's edge: 4 pixels on, 3 off. */
export const ZOOM_BOX_DASH = '4 3';

/** The CSS `fill` and `stroke` of the zoom tool's box, for a style (not an SVG attribute). */
export function zoomBoxPaint(
  colors: ZoomBoxColors,
  accent: string,
): { readonly fill: string; readonly stroke: string } {
  return {
    fill: paint('zoom-box-fill', colors.fill ?? mixAccent('zoom-box-fill', accent)),
    stroke: paint('zoom-box-stroke', colors.stroke ?? accent),
  };
}
