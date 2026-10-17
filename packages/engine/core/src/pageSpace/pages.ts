import type { PageCoordinates, PdfCoordinates } from './coordinates';
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
export function pageSpaceBoxesOf(boxes: PageBoxes<PdfCoordinates>): PageBoxes<PageCoordinates> {
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
 * A page's layout in page space. Its actions may go to other pages, so each
 * destination is measured with `boxOf`, the box of the page it goes to.
 */
export function pageLayoutOf(
  layout: PageLayout<PdfCoordinates>,
  boxOf: VisibleBoxOf,
): PageLayout<PageCoordinates> {
  const { actions, ...rest } = layout;
  return {
    ...rest,
    boxes: pageSpaceBoxesOf(layout.boxes),
    ...(actions
      ? {
          actions: mapPageActions(actions, (destination) => pageDestinationOf(destination, boxOf)),
        }
      : {}),
  };
}

/** Every page's visible box, by page, from the pages' layouts. */
export function visibleBoxesOf(pages: readonly PageLayout<PdfCoordinates>[]): VisibleBoxOf {
  const boxes = new Map<number, PdfRect>(
    pages.map((page) => [page.ref.objectNumber, page.boxes.crop]),
  );
  return (page) => {
    const box = boxes.get(page.objectNumber);
    if (!box) {
      throw new EngineError(
        EngineErrorCode.InvalidArg,
        `No page ${page.objectNumber} in this document`,
      );
    }
    return box;
  };
}

/** The document's pages in page space. */
export function pageListOf(
  snapshot: PageListSnapshot<PdfCoordinates>,
): PageListSnapshot<PageCoordinates> {
  const boxOf = visibleBoxesOf(snapshot.pages);
  return { ...snapshot, pages: snapshot.pages.map((page) => pageLayoutOf(page, boxOf)) };
}
