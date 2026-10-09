import type { EventOrigin } from '@embedpdf/core';
import type { Annotation, AnnotationRef, PageRef } from '@embedpdf/engine-core/runtime';

import type { AnnotationEvents } from './events';

/**
 * Announces confirmed record changes: the engine's record, whoever caused the
 * change (an API verb, a gesture, a remote session).
 */
export function createAnnouncer(events: AnnotationEvents) {
  return {
    created: (annotation: Annotation, origin: EventOrigin) =>
      events.created.emit({ annotation, origin }),
    updated: (annotation: Annotation, origin: EventOrigin) =>
      events.updated.emit({ annotation, origin }),
    deleted: (refs: readonly AnnotationRef[], page: PageRef, origin: EventOrigin) =>
      events.deleted.emit({ refs, page, origin }),
    reordered: (page: PageRef, order: readonly AnnotationRef[], origin: EventOrigin) =>
      events.reordered.emit({ page, order, origin }),
  };
}

export type Announcer = ReturnType<typeof createAnnouncer>;
