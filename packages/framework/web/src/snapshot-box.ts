/**
 * How the box the `snapshot` tool drags looks: the render plugin's
 * `snapshot.box` setting, the accent its colors follow, and the
 * `--epdf-snapshot-box-*` variables that win over both. Dashed like the zoom
 * tool's box, so every box you drag reads the same.
 */
import { mixAccent, paint } from './theme';
import { ZOOM_BOX_DASH } from './zoom-box';

/** The render plugin's `snapshot.box` setting: a `null` color follows the accent. */
export interface SnapshotBoxColors {
  readonly fill: string | null;
  readonly stroke: string | null;
}

/** The SVG dash array of the box's edge: the zoom tool's, 4 pixels on, 3 off. */
export const SNAPSHOT_BOX_DASH = ZOOM_BOX_DASH;

/** The CSS `fill` and `stroke` of the snapshot tool's box, for a style (not an SVG attribute). */
export function snapshotBoxPaint(
  colors: SnapshotBoxColors,
  accent: string,
): { readonly fill: string; readonly stroke: string } {
  return {
    fill: paint('snapshot-box-fill', colors.fill ?? mixAccent('snapshot-box-fill', accent)),
    stroke: paint('snapshot-box-stroke', colors.stroke ?? accent),
  };
}
