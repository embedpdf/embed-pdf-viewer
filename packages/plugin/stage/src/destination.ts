/**
 * PDF destination → reveal: the pure translator between the PDF protocol's
 * navigation vocabulary (ISO 32000-1 §12.3.2.2) and the stage's arrival
 * primitive. Outline clicks, link annotations and `/OpenAction` all resolve
 * (engine-side) to an explicit `PdfDestination`; this maps it onto one
 * `reveal(pageIndex, options)` call, and no destination-specific camera code
 * exists anywhere else.
 *
 * The whole protocol collapses onto three knobs:
 *   rect   — what to look at (a point for /XYZ, a rect for /FitR, the
 *            page for /Fit, the content bounding box for /FitB*)
 *   zoom   — 'keep' | {level} | 'fit' | 'fit-width' | 'fit-height'
 *   anchor — where it lands; 'keep' encodes the spec's null-means-retain
 *
 * Coordinates convert PDF user space (y-up, absolute) → content space
 * (y-down, crop-relative) through the same `pdfToContent` matrix selection
 * and search use, so a destination and an overlay never disagree.
 */
import { applyPoint, pageGeometry } from '@embedpdf/core-geometry';
import type { Rect } from '@embedpdf/core-geometry';
import type { PageLayout, PdfDestination } from '@embedpdf/core';
import type { RevealOptions } from './contract';

export interface DestinationReveal {
  /** Display index for `reveal()` — from the layout row. */
  pageIndex: number;
  options: RevealOptions;
}

/**
 * Translate one explicit destination against its target page's layout.
 * `boundingBox` is the page's content bounding box in content space, for the
 * `/FitB*` kinds: pass it when known; otherwise the crop box stands in, which
 * the specification tolerates.
 */
export function destinationToReveal(
  destination: PdfDestination,
  layout: PageLayout,
  boundingBox?: Rect,
): DestinationReveal {
  const geometry = pageGeometry(
    { crop: layout.boxes.crop, rotation: layout.rotation, userUnit: layout.userUnit },
    1,
  );
  const crop = layout.boxes.crop;
  const toContent = (x: number, y: number) => applyPoint(geometry.pdfToContent, { x, y });
  const page: Rect = { x: 0, y: 0, width: layout.size.width, height: layout.size.height };
  const box = boundingBox ?? page;

  const options = ((): RevealOptions => {
    switch (destination.kind) {
      case 'xyz': {
        const hasLeft = destination.left != null;
        const hasTop = destination.top != null;
        // Null axes keep the current camera value; the coordinate fed in for
        // them is inert (the 'keep' anchor never reads it).
        const point = toContent(destination.left ?? crop.left, destination.top ?? crop.top);
        return {
          rect: { x: point.x, y: point.y, width: 0, height: 0 },
          anchor: { x: hasLeft ? 'start' : 'keep', y: hasTop ? 'start' : 'keep' },
          // A /XYZ zoom of 0 means the same as null: retain the current zoom.
          zoom:
            destination.zoom != null && destination.zoom !== 0
              ? { level: destination.zoom }
              : 'keep',
        };
      }
      case 'fit':
        return { zoom: 'fit' }; // whole page; slack axis centers
      case 'fitH': {
        const hasTop = destination.top != null;
        const y = hasTop ? toContent(crop.left, destination.top!).y : 0;
        return {
          rect: { x: 0, y, width: page.width, height: 0 },
          zoom: 'fit-width',
          anchor: { y: hasTop ? 'start' : 'keep' },
        };
      }
      case 'fitV': {
        const hasLeft = destination.left != null;
        const x = hasLeft ? toContent(destination.left!, crop.top).x : 0;
        return {
          rect: { x, y: 0, width: 0, height: page.height },
          zoom: 'fit-height',
          anchor: { x: hasLeft ? 'start' : 'keep' },
        };
      }
      case 'fitR': {
        const topLeft = toContent(destination.left, destination.top);
        const bottomRight = toContent(destination.right, destination.bottom);
        return {
          rect: {
            x: Math.min(topLeft.x, bottomRight.x),
            y: Math.min(topLeft.y, bottomRight.y),
            width: Math.abs(bottomRight.x - topLeft.x),
            height: Math.abs(bottomRight.y - topLeft.y),
          },
          zoom: 'fit',
        };
      }
      case 'fitB':
        return { rect: box, zoom: 'fit' };
      case 'fitBH': {
        const hasTop = destination.top != null;
        const y = hasTop ? toContent(crop.left, destination.top!).y : box.y;
        return {
          rect: { x: box.x, y, width: box.width, height: 0 },
          zoom: 'fit-width',
          anchor: { y: hasTop ? 'start' : 'keep' },
        };
      }
      case 'fitBV': {
        const hasLeft = destination.left != null;
        const x = hasLeft ? toContent(destination.left!, crop.top).x : box.x;
        return {
          rect: { x, y: box.y, width: 0, height: box.height },
          zoom: 'fit-height',
          anchor: { x: hasLeft ? 'start' : 'keep' },
        };
      }
    }
  })();

  return { pageIndex: layout.index, options };
}
