/**
 * Where a sheet comes to rest after its handle is let go: at one of the
 * heights it rests at, or closed. A flick moves it a whole step, down to the
 * next lower height (closing from the lowest) or up to the next higher one;
 * a slow drag settles at the nearest height, and closes when the sheet was
 * dragged below half of the lowest.
 */

/** A release faster than this, in px per second, is a flick. */
export const SHEET_FLICK_PX_PER_S = 500;

/** How much of the viewer's height a panel's sheet opens at. */
export const PANEL_SHEET_OPEN_FRACTION = 0.5;

/** Px a sheet leaves above itself at its tallest, so the pages show it's a sheet. */
export const SHEET_TOP_CLEARANCE_PX = 40;

/**
 * The height a sheet dragged to `height` comes to rest at, one of `heights` (ascending), or null
 * when it closes. `velocity` is the release speed in px per second, downward positive.
 */
export function sheetRestOf(
  heights: readonly number[],
  height: number,
  velocity: number,
): number | null {
  if (heights.length === 0) return null;
  if (velocity >= SHEET_FLICK_PX_PER_S) {
    const lower = heights.filter((rest) => rest < height - 1);
    return lower.length > 0 ? lower[lower.length - 1]! : null;
  }
  if (velocity <= -SHEET_FLICK_PX_PER_S) {
    return heights.find((rest) => rest > height + 1) ?? heights[heights.length - 1]!;
  }
  if (height < heights[0]! / 2) return null;
  return heights.reduce((nearest, rest) =>
    Math.abs(rest - height) < Math.abs(nearest - height) ? rest : nearest,
  );
}

/** The heights a panel's sheet rests at in a viewer `viewerHeight` px tall: half of it, and nearly all. */
export function panelSheetHeightsOf(viewerHeight: number): readonly number[] {
  const tallest = Math.max(0, Math.round(viewerHeight - SHEET_TOP_CLEARANCE_PX));
  const open = Math.min(tallest, Math.round(viewerHeight * PANEL_SHEET_OPEN_FRACTION));
  return open < tallest ? [open, tallest] : [tallest];
}
