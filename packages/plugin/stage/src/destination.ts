/**
 * A destination as a reveal. A destination (ISO 32000-1 §12.3.2.2) says
 * where on a page to look and how close; the stage's reveal takes the same
 * three knobs:
 *   rect   — what to look at: a point for `xyz`, a rect for `fitR`, the page
 *            for `fit` and the `fitB*` kinds
 *   zoom   — 'keep' | {level} | 'fit' | 'fit-width' | 'fit-height'
 *   anchor — where it lands; 'keep' is the specification's `null`: keep the
 *            current value on that axis
 *
 * Destinations are in page space, the stage's own space, so nothing converts.
 * The `fitB*` kinds fit the page's content bounding box; the whole page
 * stands in for it.
 */
import type { PageDestination, PdfSize } from '@embedpdf/core';

import type { RevealOptions } from './contract';

export function revealOfDestination(destination: PageDestination, size: PdfSize): RevealOptions {
  const { width, height } = size;
  switch (destination.kind) {
    case 'xyz': {
      const { x, y, zoom } = destination;
      return {
        // A null axis keeps the current camera value; the number fed in for
        // it is never read (the 'keep' anchor).
        rect: { x: x ?? 0, y: y ?? 0, width: 0, height: 0 },
        anchor: { x: x != null ? 'start' : 'keep', y: y != null ? 'start' : 'keep' },
        // A zoom of 0 means the same as null: keep the current zoom.
        zoom: zoom != null && zoom !== 0 ? { level: zoom } : 'keep',
      };
    }
    case 'fit':
      return { zoom: 'fit' };
    case 'fitB':
      return { rect: { x: 0, y: 0, width, height }, zoom: 'fit' };
    case 'fitH':
    case 'fitBH': {
      const { y } = destination;
      return {
        rect: { x: 0, y: y ?? 0, width, height: 0 },
        zoom: 'fit-width',
        anchor: { y: y != null ? 'start' : 'keep' },
      };
    }
    case 'fitV':
    case 'fitBV': {
      const { x } = destination;
      return {
        rect: { x: x ?? 0, y: 0, width: 0, height },
        zoom: 'fit-height',
        anchor: { x: x != null ? 'start' : 'keep' },
      };
    }
    case 'fitR': {
      const { x, y, width: rectWidth, height: rectHeight } = destination;
      return { rect: { x, y, width: rectWidth, height: rectHeight }, zoom: 'fit' };
    }
  }
}
