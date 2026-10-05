/**
 * Which render runs first: the engine priority every render the plugin asks
 * for carries (higher runs first), from what the views show.
 *
 * The facts come from the views' demands (`ViewDemand.setDemand`): how many
 * device pixels of each page are on screen, in the view that shows the most
 * of it, and the focus page, the one with the most pixels on screen. A
 * thumbnail rail's pages are on screen too, but small, so they rank after
 * the main view's pages of their band.
 *
 * A render's band dominates its priority; within a band, the page with more
 * pixels on screen goes first. The bands, most urgent first:
 *
 *   | Band           | Renders                                                  |
 *   | :------------- | :------------------------------------------------------- |
 *   | `focusBase`    | the focus page's base                                    |
 *   | `focusTiles`   | the focus page's visible tiles                           |
 *   | `visibleBase`  | other visible pages' bases                               |
 *   | `visibleTiles` | other visible pages' visible tiles                       |
 *   | `prefetch`     | the tile ring around what shows; bases of pages placed   |
 *   |                | but off screen                                           |
 *
 * A page no view has a demand for (an app's own `renderPage`, a view without
 * a tile plane) gets 0, the engine's default: after every band.
 */
import type { PageObjectNumber } from '@embedpdf/core';

import type { PageViewDemand } from './paint-plan';

/** What a render is for. */
export type RenderPurpose = 'base' | 'tile' | 'prefetch';

/** What the views show: each page's device pixels on screen, and the focus page. */
export interface ScreenFacts {
  /** Per page with a demand: device pixels on screen, the most of any view (0 off screen). */
  readonly pixels: ReadonlyMap<PageObjectNumber, number>;
  /** The page with the most pixels on screen; null while nothing shows. */
  readonly focus: PageObjectNumber | null;
}

export const NO_SCREEN_FACTS: ScreenFacts = { pixels: new Map(), focus: null };

/** A page's size in points (unrotated), as the demand's device width spans it. */
interface PageSize {
  readonly width: number;
  readonly height: number;
}

/** Device pixels of the page on screen under one view's demand. */
export function pixelsOnScreen(demand: PageViewDemand, page: PageSize): number {
  // Device pixels per point; a demand without a visible rect shows the whole page.
  const scale = demand.desiredDeviceWidth / page.width;
  const visible = demand.visibleRect ?? page;
  return visible.width * visible.height * scale * scale;
}

/** The facts of every demand the views set: one entry per view and page. */
export function screenFacts(
  demands: Iterable<{ page: PageObjectNumber; demand: PageViewDemand }>,
  pageSize: (page: PageObjectNumber) => PageSize | undefined,
): ScreenFacts {
  const pixels = new Map<PageObjectNumber, number>();
  let focus: PageObjectNumber | null = null;
  let focusPixels = 0;
  for (const { page, demand } of demands) {
    const size = pageSize(page);
    if (!size) continue;
    const onScreen = Math.max(pixels.get(page) ?? 0, pixelsOnScreen(demand, size));
    pixels.set(page, onScreen);
    if (onScreen > focusPixels) {
      focus = page;
      focusPixels = onScreen;
    }
  }
  return { pixels, focus };
}

/** Each band's weight: higher runs first. */
const BAND_WEIGHT = {
  prefetch: 1,
  visibleTiles: 2,
  visibleBase: 3,
  focusTiles: 4,
  focusBase: 5,
} as const;

/** One band's span: more device pixels than any screen shows, so pixels never cross a band. */
const BAND_SPAN = 2 ** 26;

/** The engine priority of a render of `page` for `purpose`. */
export function renderPriority(
  purpose: RenderPurpose,
  page: PageObjectNumber,
  facts: ScreenFacts,
): number {
  const pixels = facts.pixels.get(page);
  if (pixels === undefined) return 0;
  const focus = page === facts.focus;
  const band =
    purpose === 'prefetch' || pixels === 0
      ? 'prefetch'
      : purpose === 'base'
        ? focus
          ? 'focusBase'
          : 'visibleBase'
        : focus
          ? 'focusTiles'
          : 'visibleTiles';
  return BAND_WEIGHT[band] * BAND_SPAN + Math.min(BAND_SPAN - 1, Math.round(pixels));
}
