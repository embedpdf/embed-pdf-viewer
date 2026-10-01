import type { EventOrigin } from '@embedpdf/core';
import type { AnnotationDTO, AnnotationRef, PageRef } from '@embedpdf/engine-core/runtime';

import type { AnnotationEvents } from './events';

/**
 * Announces confirmed record changes: the engine's record, whoever caused the
 * change (an API verb, a gesture, a remote session).
 */
export function createAnnouncer(events: AnnotationEvents) {
  return {
    created: (annotation: AnnotationDTO, origin: EventOrigin) =>
      events.created.emit({ annotation, origin }),
    updated: (annotation: AnnotationDTO, origin: EventOrigin) =>
      events.updated.emit({ annotation, origin }),
    deleted: (ref: AnnotationRef, page: PageRef, origin: EventOrigin) =>
      events.deleted.emit({ ref, page, origin }),
  };
}

export type Announcer = ReturnType<typeof createAnnouncer>;
