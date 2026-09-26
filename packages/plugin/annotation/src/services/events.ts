import type { MirrorChange } from '@embedpdf/core';

import type {
  AnnotationCreatedEvent,
  AnnotationDeletedEvent,
  AnnotationDraftChangedEvent,
  AnnotationEditingChangedEvent,
  AnnotationResyncedEvent,
  AnnotationSelectionChangedEvent,
  AnnotationUpdatedEvent,
  AnnotationWriteFailedEvent,
  CommentThreadChangedEvent,
} from '../contract';
import type { CapturedAnnotationDraft } from '../host-contract';
import type { AnnotationContext } from './context';
import type { AnnotationRecords } from '../sync/records';

/**
 * The plugin's events. Record events (created, updated, deleted, resynced)
 * fire when the records mirror confirms a change (sync/confirmed.ts);
 * selection, draft and editing events are derived from state changes in the
 * store service; `writeFailed` fires when the engine refuses a change the
 * user made; the rest fire where their operation completes. `recordsChanged`
 * is internal: every change the records mirror applied.
 */
export function createAnnotationEvents(ctx: Pick<AnnotationContext, 'events'>) {
  return {
    created: ctx.events.source<AnnotationCreatedEvent>(),
    updated: ctx.events.source<AnnotationUpdatedEvent>(),
    deleted: ctx.events.source<AnnotationDeletedEvent>(),
    resynced: ctx.events.source<AnnotationResyncedEvent>(),
    selectionChanged: ctx.events.source<AnnotationSelectionChangedEvent>(),
    draftChanged: ctx.events.source<AnnotationDraftChangedEvent>(),
    editingChanged: ctx.events.source<AnnotationEditingChangedEvent>(),
    threadChanged: ctx.events.source<CommentThreadChangedEvent>(),
    draftCaptured: ctx.events.source<CapturedAnnotationDraft>(),
    writeFailed: ctx.events.source<AnnotationWriteFailedEvent>(),
    recordsChanged: ctx.events.source<MirrorChange<AnnotationRecords>>(),
  };
}

export type AnnotationEvents = ReturnType<typeof createAnnotationEvents>;
