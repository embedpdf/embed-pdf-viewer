import type {
  AnnotationCreatedEvent,
  AnnotationDeletedEvent,
  AnnotationDraftChangedEvent,
  AnnotationEditingChangedEvent,
  AnnotationResyncedEvent,
  AnnotationSelectionChangedEvent,
  AnnotationUpdatedEvent,
  CommentThreadChangedEvent,
} from '../contract';
import type { CapturedAnnotationDraft } from '../host-contract';
import type { AnnotationContext } from './context';

/**
 * The plugin's events. Record events (created, updated, deleted, resynced)
 * fire from the records mirror; selection, draft and editing events are
 * derived from state changes in the store service; the rest fire where their
 * operation completes.
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
  };
}

export type AnnotationEvents = ReturnType<typeof createAnnotationEvents>;
