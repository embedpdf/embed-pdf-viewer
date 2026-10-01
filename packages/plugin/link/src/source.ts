/**
 * The stand-alone source, used when no annotation plugin is installed: the
 * clickable areas among one page's annotations, in page space.
 */
import type { PageRef } from '@embedpdf/core';
import type { Annotation } from '@embedpdf/engine-core/runtime';

import type { Link } from './contract';

/** The visible link annotations of a page that have a target. */
export function linksOf(annotations: readonly Annotation[], page: PageRef): readonly Link[] {
  const links: Link[] = [];
  for (const dto of annotations) {
    if (dto.subtype !== 'link' || dto.target == null) continue;
    if (dto.hidden || dto.noView) continue;
    links.push({
      id:
        dto.ref.kind === 'objectNumber'
          ? `obj:${dto.ref.objectNumber}`
          : `idx:${page.objectNumber}:${dto.index}`,
      bounds: dto.rect,
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
