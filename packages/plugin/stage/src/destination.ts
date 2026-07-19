/**
 * PDF destination → reveal: the pure translator between the PDF protocol's
 * navigation vocabulary (ISO 32000-1 §12.3.2.2) and the Stage's arrival
 * primitive. Outline clicks, link annotations, and `/OpenAction` all
 * resolve (engine-side) to an explicit `PdfDestination`; this maps it onto
 * ONE `reveal(pageIndex, options)` call — no destination-specific camera
 * code exists anywhere else.
 *
 * The whole protocol collapses onto three knobs:
 *   rect   — what to look at (a point for /XYZ, a rect for /FitR, the
 *            page for /Fit, the content bounding box for /FitB*)
 *   zoom   — 'keep' | {level} | 'fit' | 'fit-width' | 'fit-height'
 *   anchor — where it lands; 'keep' encodes the spec's null-means-retain
 *
 * Coordinates convert PDF user space (y-up, absolute) → content space
 * (y-down, crop-relative) through the SAME `pdfToContent` matrix selection
 * and search use, so a destination and an overlay can never disagree.
 */
import { applyPoint, pageGeometry } from '@embedpdf/core-geometry';
import type { Rect } from '@embedpdf/core-geometry';
import type { PageLayout, PdfDestination } from '@embedpdf/core';
import type { RevealOptions } from './types';

export interface DestinationReveal {
  /** Display index for `reveal()` — from the layout row. */
  pageIndex: number;
  options: RevealOptions;
}

/**
 * Translate one explicit destination against its target page's layout.
 * `bbox` is the page's content BOUNDING box in CONTENT space, for the
 * `/FitB*` kinds — pass it when known; the crop box is the spec-tolerated
 * fallback until the engine exposes it.
 */
export function destinationToReveal(
  dest: PdfDestination,
  layout: PageLayout,
  bbox?: Rect,
): DestinationReveal {
  const geo = pageGeometry(
    { crop: layout.boxes.crop, rotation: layout.rotation, userUnit: layout.userUnit },
    1,
  );
  const crop = layout.boxes.crop;
  const toContent = (x: number, y: number) => applyPoint(geo.pdfToContent, { x, y });
  const page: Rect = { x: 0, y: 0, width: layout.size.width, height: layout.size.height };
  const box = bbox ?? page;

  const options = ((): RevealOptions => {
    switch (dest.kind) {
      case 'xyz': {
        const hasLeft = dest.left != null;
        const hasTop = dest.top != null;
        // Null axes keep the current camera value — the coordinate fed in
        // for them is inert (the 'keep' anchor never reads it).
        const p = toContent(dest.left ?? crop.left, dest.top ?? crop.top);
        return {
          rect: { x: p.x, y: p.y, width: 0, height: 0 },
          anchor: { x: hasLeft ? 'start' : 'keep', y: hasTop ? 'start' : 'keep' },
          // A /XYZ zoom of 0 means null means "retain current".
          zoom: dest.zoom != null && dest.zoom !== 0 ? { level: dest.zoom } : 'keep',
        };
      }
      case 'fit':
        return { zoom: 'fit' }; // whole page; slack axis centers
      case 'fitH': {
        const hasTop = dest.top != null;
        const y = hasTop ? toContent(crop.left, dest.top!).y : 0;
        return {
          rect: { x: 0, y, width: page.width, height: 0 },
          zoom: 'fit-width',
          anchor: { y: hasTop ? 'start' : 'keep' },
        };
      }
      case 'fitV': {
        const hasLeft = dest.left != null;
        const x = hasLeft ? toContent(dest.left!, crop.top).x : 0;
        return {
          rect: { x, y: 0, width: 0, height: page.height },
          zoom: 'fit-height',
          anchor: { x: hasLeft ? 'start' : 'keep' },
        };
      }
      case 'fitR': {
        const tl = toContent(dest.left, dest.top);
        const br = toContent(dest.right, dest.bottom);
        return {
          rect: {
            x: Math.min(tl.x, br.x),
            y: Math.min(tl.y, br.y),
            width: Math.abs(br.x - tl.x),
            height: Math.abs(br.y - tl.y),
          },
          zoom: 'fit',
        };
      }
      case 'fitB':
        return { rect: box, zoom: 'fit' };
      case 'fitBH': {
        const hasTop = dest.top != null;
        const y = hasTop ? toContent(crop.left, dest.top!).y : box.y;
        return {
          rect: { x: box.x, y, width: box.width, height: 0 },
          zoom: 'fit-width',
          anchor: { y: hasTop ? 'start' : 'keep' },
        };
      }
      case 'fitBV': {
        const hasLeft = dest.left != null;
        const x = hasLeft ? toContent(dest.left!, crop.top).x : box.x;
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
