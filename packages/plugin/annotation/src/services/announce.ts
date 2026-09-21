import type { ChangeOrigin } from '@embedpdf/core';
import type { AnnotationDTO, AnnotationRef, PageRef } from '@embedpdf/engine-core/runtime';

import type { Annotation } from '../contract';
import type { AnnotationEvents } from './events';

/**
 * Announces confirmed record changes with their page-space projection —
 * the one shape `onCreated` / `onUpdated` / `onDeleted` carry, whoever
 * caused the change (an API verb, a gesture, a remote session).
 */
export function createAnnouncer(
  events: AnnotationEvents,
  project: (ref: AnnotationRef) => Annotation | null,
) {
  const changed = (
    hook: AnnotationEvents['created'],
    dto: AnnotationDTO,
    origin: ChangeOrigin,
  ): void =>
    hook.emit({
      ref: dto.ref,
      page: dto.page,
      subtype: dto.subtype,
      annotation: project(dto.ref),
      raw: dto,
      origin,
    });
  return {
    created: (dto: AnnotationDTO, origin: ChangeOrigin) => changed(events.created, dto, origin),
    updated: (dto: AnnotationDTO, origin: ChangeOrigin) => changed(events.updated, dto, origin),
    deleted: (ref: AnnotationRef, page: PageRef, origin: ChangeOrigin) =>
      events.deleted.emit({ ref, page, origin }),
  };
}

export type Announcer = ReturnType<typeof createAnnouncer>;
