/**
 * How a panel opens and how wide it is. By default a panel docks beside the
 * pages in a wide viewer, opens over their edge at medium widths and is a
 * sheet on a phone; its layout `present` changes that, for every size or for
 * some. A docked panel's inner edge, the one beside the pages, drags between
 * the narrowest and the widest its layout `width` allows; it is on the panel's
 * right at the start in a left-to-right language and on its left at the end,
 * the other way round in a right-to-left one.
 */
import {
  panelPresentationsOf,
  panelWidthFieldsOf,
  type PanelPresentation,
  type PanelPresentationBySize,
  type PanelWidth,
  type ViewerSize,
} from '@embedpdf/core-ui';

/** The side of the pages a panel opens on. */
export type PanelSide = 'start' | 'end';

/** The writing direction the panel's sides follow. */
export type PanelDirection = 'ltr' | 'rtl';

/** A panel's widths in px, every one given: where it starts, the narrowest and the widest. */
export interface PanelWidths {
  readonly initial: number;
  readonly min: number;
  readonly max: number;
}

/** The widths of a panel whose layout doesn't give them. */
export const DEFAULT_PANEL_WIDTHS: PanelWidths = { initial: 288, min: 200, max: 640 };

/** How far one arrow key moves a docked panel's edge; with Shift, four times as far. */
export const PANEL_WIDTH_STEP_PX = 16;

/** How much of the pages an overlay leaves uncovered, so a click on them can close it. */
export const OVERLAY_CLEARANCE_PX = 48;

/** How a panel opens at each size when its layout doesn't say. */
export const DEFAULT_PRESENTATIONS: Readonly<Record<ViewerSize, PanelPresentation>> = {
  compact: 'sheet',
  medium: 'overlay',
  expanded: 'dock',
};

/** How a panel opens at `size`: what its layout `present` says for that size, else the default. */
export function presentationOf(
  size: ViewerSize,
  present?: PanelPresentation | PanelPresentationBySize,
): PanelPresentation {
  return (
    (present === undefined ? undefined : panelPresentationsOf(present)[size]) ??
    DEFAULT_PRESENTATIONS[size]
  );
}

/** A panel's widths from its layout `width`, the rest the defaults. A `min` over the `max` is the `max`. */
export function panelWidthsOf(width?: number | PanelWidth): PanelWidths {
  const given = width === undefined ? {} : panelWidthFieldsOf(width);
  const max = given.max ?? DEFAULT_PANEL_WIDTHS.max;
  const min = Math.min(given.min ?? DEFAULT_PANEL_WIDTHS.min, max);
  return { initial: given.initial ?? DEFAULT_PANEL_WIDTHS.initial, min, max };
}

/** The widest a docked panel gets in a viewer `viewerWidth` px wide: never more than half of it. */
export function maxPanelWidthOf(viewerWidth: number, widths: PanelWidths): number {
  return Math.max(widths.min, Math.min(widths.max, Math.floor(viewerWidth / 2)));
}

/** `width` kept between the narrowest and the widest the panel gets in this viewer. */
export function clampPanelWidth(width: number, viewerWidth: number, widths: PanelWidths): number {
  const widest = maxPanelWidthOf(viewerWidth, widths);
  return Math.round(Math.min(widest, Math.max(widths.min, width)));
}

/** An overlay's width: its panel's, leaving some of the pages uncovered. */
export function overlayWidthOf(width: number, viewerWidth: number): number {
  return Math.round(Math.max(0, Math.min(width, viewerWidth - OVERLAY_CLEARANCE_PX)));
}

/** A docked panel's inner edge: the side it's on, and how far it can go in this viewer. */
export interface PanelEdge {
  readonly side: PanelSide;
  readonly dir: PanelDirection;
  /** The viewer's width, in px. */
  readonly viewerWidth: number;
  readonly widths: PanelWidths;
}

/** `1` when moving the inner edge to the right widens the panel, `-1` when it narrows it. */
export function widenDirectionOf(side: PanelSide, dir: PanelDirection): 1 | -1 {
  return (side === 'start') === (dir === 'ltr') ? 1 : -1;
}

/** The width after the inner edge moves `dx` px (rightward positive) from where it was at `width`. */
export function widthAfterDrag(width: number, dx: number, edge: PanelEdge): number {
  return clampPanelWidth(
    width + dx * widenDirectionOf(edge.side, edge.dir),
    edge.viewerWidth,
    edge.widths,
  );
}

/**
 * The width after `key` on the inner edge, or null for a key that doesn't move it: the arrows
 * move the edge left or right, Home makes the panel its narrowest and End its widest.
 */
export function widthAfterKey(
  width: number,
  key: string,
  shiftKey: boolean,
  edge: PanelEdge,
): number | null {
  const step = PANEL_WIDTH_STEP_PX * (shiftKey ? 4 : 1);
  if (key === 'ArrowRight') return widthAfterDrag(width, step, edge);
  if (key === 'ArrowLeft') return widthAfterDrag(width, -step, edge);
  if (key === 'Home') return clampPanelWidth(edge.widths.min, edge.viewerWidth, edge.widths);
  if (key === 'End') return maxPanelWidthOf(edge.viewerWidth, edge.widths);
  return null;
}
