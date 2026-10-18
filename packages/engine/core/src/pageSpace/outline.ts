import { mapActionTree, mapLinkTarget, pageDestinationOf, pdfDestinationOf } from './destinations';
import type { VisibleBoxOf } from './destinations';
import type {
  DocumentOutline,
  OutlineItem,
  OutlineItemDraft,
  OutlineItemPatch,
} from '../dto/DocumentOutline';
import type { PageDestination, PdfDestination } from '../dto/PdfDestination';
import type { PdfLinkTargetWritable } from '../dto/PdfLinkTarget';

/**
 * The outline between the file's coordinates and page space: only the
 * destinations an item goes to change, each measured on the page it goes to.
 */

/** An item, its target's and its action's destinations converted. */
export function mapOutlineItem<From, To>(
  item: OutlineItem<From>,
  convert: (destination: From) => To,
): OutlineItem<To> {
  return {
    ...item,
    target: item.target && mapLinkTarget(item.target, convert),
    action: item.action && mapActionTree(item.action, convert),
  };
}

/** A draft or a patch, its target's destination converted. */
function mapOutlineWrite<From, To, W extends { target?: PdfLinkTargetWritable<From> | null }>(
  write: W,
  convert: (destination: From) => To,
): Omit<W, 'target'> & { target?: PdfLinkTargetWritable<To> | null } {
  const { target, ...rest } = write;
  if (target === undefined) return rest;
  return {
    ...rest,
    target:
      target && target.kind === 'goto'
        ? { ...target, destination: convert(target.destination) }
        : (target as PdfLinkTargetWritable<To> | null),
  };
}

/** The outline as a read hands it out: every destination in page space. */
export function pageOutlineOf(
  outline: DocumentOutline<PdfDestination>,
  boxOf: VisibleBoxOf,
): DocumentOutline<PageDestination> {
  return {
    ...outline,
    items: outline.items.map((item) => pageOutlineItemOf(item, boxOf)),
  };
}

export function pageOutlineItemOf(
  item: OutlineItem<PdfDestination>,
  boxOf: VisibleBoxOf,
): OutlineItem<PageDestination> {
  return mapOutlineItem(item, (destination) => pageDestinationOf(destination, boxOf));
}

/** A draft in the file's coordinates, as the engine writes it. */
export function pdfOutlineDraftOf(
  draft: OutlineItemDraft<PageDestination>,
  boxOf: VisibleBoxOf,
): OutlineItemDraft<PdfDestination> {
  return mapOutlineWrite(draft, (destination: PageDestination) =>
    pdfDestinationOf(destination, boxOf),
  ) as OutlineItemDraft<PdfDestination>;
}

/** A patch in the file's coordinates, as the engine writes it. */
export function pdfOutlinePatchOf(
  patch: OutlineItemPatch<PageDestination>,
  boxOf: VisibleBoxOf,
): OutlineItemPatch<PdfDestination> {
  return mapOutlineWrite(patch, (destination: PageDestination) =>
    pdfDestinationOf(destination, boxOf),
  ) as OutlineItemPatch<PdfDestination>;
}
