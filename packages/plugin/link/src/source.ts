import type { DocumentHandle, PageLayout, PageRef } from '@embedpdf/core';
import { pdfToContentRect } from '@embedpdf/core-annotation';
import type { Link } from './contract';
import type { LinkAction } from './model';

/** What the loader needs from the context (the controller context satisfies it). */
export interface LinkSourceIO {
  doc: DocumentHandle | null;
  document(): { pages: readonly PageLayout[] } | null;
  dispatch(action: LinkAction): void;
}

/**
 * The stand-alone source (no annotation plugin): one annotations read per
 * page, folded to the clickable areas. Resolves with the items it stored
 * (empty when the page is unknown or the read failed).
 */
export async function loadLinksPage(io: LinkSourceIO, page: PageRef): Promise<readonly Link[]> {
  const doc = io.doc;
  const pon = page.pageObjectNumber;
  const crop = io.document()?.pages.find((p) => p.ref.pageObjectNumber === pon)?.boxes.crop;
  if (!doc || !crop) return [];
  let snap;
  try {
    snap = await doc.page(page).annotations.list();
  } catch {
    return [];
  }
  const items: Link[] = [];
  for (const dto of snap.annotations) {
    if (dto.subtype !== 'link' || dto.target == null) continue;
    if (dto.flags.hidden || dto.flags.noView) continue;
    items.push({
      id:
        dto.ref.kind === 'objectNumber'
          ? `obj:${dto.ref.annotObjectNumber}`
          : `idx:${pon}:${dto.index}`,
      bounds: pdfToContentRect(dto.rect, crop),
      target: dto.target,
      ...(dto.actions?.activate ? { activate: dto.actions.activate } : {}),
      ...(dto.actions?.cursorEnter?.root || dto.actions?.cursorExit?.root
        ? {
            hoverEvents: {
              enter: Boolean(dto.actions?.cursorEnter?.root),
              exit: Boolean(dto.actions?.cursorExit?.root),
            },
          }
        : {}),
      ref: dto.ref,
      attached: dto.replyType === 'group' && dto.inReplyTo != null,
    });
  }
  io.dispatch({ type: 'setPage', page, items });
  return items;
}
