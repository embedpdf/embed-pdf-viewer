/**
 * The React side of `@embedpdf/web`'s page layers: a layer says, while it's
 * mounted, which part of its page it paints, and the render layer reads which
 * parts are painted, to leave them out of the page's picture.
 */
import { useInsertionEffect, useSyncExternalStore } from 'react';
import { pageLayersOf, type PagePart, type PaintedParts } from '@embedpdf/web';

/**
 * Say, while mounted, that this layer paints `part` of its page (`pageRef`,
 * the page context's `ref`). Said in an insertion effect, which runs before
 * any layout effect of the same commit, so a render layer mounted alongside
 * already plans its tiles without it.
 */
export function usePaintsPagePart(pageRef: object, part: PagePart): void {
  useInsertionEffect(() => pageLayersOf(pageRef).paint(part), [pageRef, part]);
}

/** Which parts of the page (`pageRef`, the page context's `ref`) the layers on it paint. */
export function usePaintedParts(pageRef: object): PaintedParts {
  const layers = pageLayersOf(pageRef);
  return useSyncExternalStore(layers.subscribe, layers.painted, layers.painted);
}
