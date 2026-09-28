import type { PageCoordinates } from './coordinates';
import { mapPageActions, pageDestinationOf, type VisibleBoxOf } from './destinations';
import type { PageBoxes, PageLayout } from '../dto/PageLayout';
import type { PageListSnapshot } from '../dto/PageListSnapshot';
import { EngineError } from '../errors/EngineError';
import { EngineErrorCode } from '../errors/EngineErrorCode';
import { pageBoxOf } from '../geometry/pageSpace';
import type { PdfRect } from '../geometry/primitives';

/**
 * A page's five boxes in page space: measured from the top-left of the crop
 * box, the visible page, which is therefore `{ x: 0, y: 0, width, height }`.
 */
export function pageSpaceBoxesOf(boxes: PageBoxes): PageBoxes<PageCoordinates> {
  const visible = boxes.crop;
  return {
    media: pageBoxOf(boxes.media, visible),
    crop: pageBoxOf(boxes.crop, visible),
    bleed: pageBoxOf(boxes.bleed, visible),
    trim: pageBoxOf(boxes.trim, visible),
    art: pageBoxOf(boxes.art, visible),
  };
}

/**
 * A page's layout in page space, with the one value in PDF space: where the
 * visible page sits in the file, for converting page-space values to the
 * numbers PDF tools use (`pdfRectOf(box, layout.pdfCropBox)`).
 */
export type PageSpaceLayout = PageLayout<PageCoordinates> & {
  /** The visible page (the crop box inside the media box) in PDF space. */
  pdfCropBox: PdfRect;
};

/** A page's layout in page space. Its actions' destinations are measured on their pages. */
export function pageLayoutOf(layout: PageLayout, boxOf: VisibleBoxOf): PageSpaceLayout {
  const { boxes, actions, ...rest } = layout;
  return {
    ...rest,
    boxes: pageSpaceBoxesOf(boxes),
    pdfCropBox: boxes.crop,
    ...(actions
      ? {
          actions: mapPageActions(actions, (destination) => pageDestinationOf(destination, boxOf)),
        }
      : {}),
  };
}

/** Every page's visible box, by page, from the pages' layouts. */
export function visibleBoxesOf(pages: readonly PageLayout[]): VisibleBoxOf {
  const boxes = new Map<number, PdfRect>(
    pages.map((page) => [page.ref.pageObjectNumber, page.boxes.crop]),
  );
  return (page) => {
    const box = boxes.get(page.pageObjectNumber);
    if (!box) {
      throw new EngineError(
        EngineErrorCode.InvalidArg,
        `No page ${page.pageObjectNumber} in this document`,
      );
    }
    return box;
  };
}

/** The document's pages in page space. */
export function pageListOf(
  snapshot: PageListSnapshot,
): Omit<PageListSnapshot<PageCoordinates>, 'pages'> & { pages: PageSpaceLayout[] } {
  const boxOf = visibleBoxesOf(snapshot.pages);
  return { ...snapshot, pages: snapshot.pages.map((page) => pageLayoutOf(page, boxOf)) };
}
