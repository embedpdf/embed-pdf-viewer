import type { DocumentHandle, PageLayout } from '@embedpdf/core';
import { pdfToContentRect } from '@embedpdf/core-annotation';
import type { LinkAction, LinkNavItem } from './types';

/**
 * The ENGINE-BACKED link source, for viewer-only deployments (no annotation
 * plugin): read a page's annotation list and keep just the navigable links —
 * standalone AND attached children alike (both are raw link DTOs here).
 * Shared by the capability's lazy `ensurePage` and the effects module's
 * event-driven refetch; both PluginContext and EffectContext satisfy the
 * structural `io` slice.
 */
export interface LinkSourceIO {
  doc: DocumentHandle | null;
  document(): { pages: readonly PageLayout[] } | null;
  dispatch(action: LinkAction): void;
}

export function loadLinksPage(io: LinkSourceIO, pon: number): void {
  const doc = io.doc;
  const crop = io.document()?.pages.find((p) => p.pageObjectNumber === pon)?.boxes.crop;
  if (!doc || !crop) return;
  doc
    .page(pon)
    .annotations.list()
    .then(
      (snap) => {
        const items: LinkNavItem[] = [];
        for (const dto of snap.annotations) {
          if (dto.subtype !== 'link' || dto.target == null) continue;
          if (dto.flags.hidden || dto.flags.noView) continue;
          items.push({
            id:
              dto.ref.kind === 'objectNumber'
                ? `obj:${dto.ref.annotObjectNumber}`
                : `idx:${pon}:${dto.index}`,
            rect: pdfToContentRect(dto.rect, crop),
            target: dto.target,
            ...(dto.actions?.activate ? { activate: dto.actions.activate } : {}),
            ref: dto.ref,
            // A `/RT /Group` child riding another annotation — labeled so the
            // nav layer can defer to editing (moot in viewer-only deployments,
            // but the item contract stays truthful either way).
            attached: dto.replyType === 'group' && dto.inReplyTo != null,
          });
        }
        io.dispatch({ type: 'SET_PAGE', pon, items });
      },
      () => {},
    );
}
