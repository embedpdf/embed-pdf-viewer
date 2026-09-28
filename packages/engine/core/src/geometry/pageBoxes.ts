import { pdfRectIntersection } from './convert';
import type { PdfRect } from './primitives';
import type { PageBoxes } from '../dto/PageLayout';

/**
 * A page's boxes as its dictionary writes them (ISO 32000-1 Table 30): the
 * media and crop boxes as inherited through the page tree, the bleed, trim
 * and art boxes the page's own, each with its corners in order. A box that
 * is absent, empty or not four numbers is left out.
 */
export interface WrittenPageBoxes {
  media?: PdfRect;
  crop?: PdfRect;
  bleed?: PdfRect;
  trim?: PdfRect;
  art?: PdfRect;
}

/** The media box of a page that has none, which the file needs: US Letter. */
export const DEFAULT_MEDIA_BOX: PdfRect = { left: 0, bottom: 0, right: 612, top: 792 };

/**
 * The page's five boxes as ISO 32000-1 §14.11.2 defines them: the crop box
 * defaults to the media box and the other three to the crop box, and each is
 * reduced to the part it shares with the media box. The crop box is then the
 * visible page, what the page shows.
 *
 * For broken files, which the standard doesn't cover: a page without a media
 * box is US Letter, and a box that shares nothing with the media box counts
 * as absent.
 */
export function pageBoxesOf(written: WrittenPageBoxes): PageBoxes {
  const media = written.media ?? DEFAULT_MEDIA_BOX;
  const within = (box: PdfRect | undefined, fallback: PdfRect): PdfRect =>
    (box && pdfRectIntersection(box, media)) ?? fallback;
  const crop = within(written.crop, media);
  return {
    media,
    crop,
    bleed: within(written.bleed, crop),
    trim: within(written.trim, crop),
    art: within(written.art, crop),
  };
}
