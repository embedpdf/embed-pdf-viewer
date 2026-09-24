/**
 * The stand-alone source, used when no annotation plugin is installed: the
 * clickable areas among one page's annotations, in page space.
 */
import type { PageRef, PdfRect } from '@embedpdf/core';
import type { AnnotationDTO } from '@embedpdf/engine-core/runtime';
import { pdfToContentRect } from '@embedpdf/core-annotation';

import type { Link } from './contract';

/** The visible link annotations of a page that have a target, projected through its crop box. */
export function linksOf(
  annotations: readonly AnnotationDTO[],
  page: PageRef,
  crop: PdfRect,
): readonly Link[] {
  const links: Link[] = [];
  for (const dto of annotations) {
    if (dto.subtype !== 'link' || dto.target == null) continue;
    if (dto.hidden || dto.noView) continue;
    links.push({
      id:
        dto.ref.kind === 'objectNumber'
          ? `obj:${dto.ref.annotObjectNumber}`
          : `idx:${page.pageObjectNumber}:${dto.index}`,
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
      attached: dto.reply?.type === 'group',
    });
  }
  return links;
}
