/**
 * The stand-alone source, used when no annotation plugin is installed: the
 * clickable areas among one page's annotations, in page space.
 */
import { annotationKey, type Annotation } from '@embedpdf/engine-core/runtime';

import type { Link } from './contract';

/** The visible link annotations of a page that have a target. */
export function linksOf(annotations: readonly Annotation[]): readonly Link[] {
  const links: Link[] = [];
  for (const dto of annotations) {
    if (dto.subtype !== 'link' || dto.target == null) continue;
    if (dto.hidden || dto.noView) continue;
    links.push({
      id: annotationKey(dto.ref),
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
