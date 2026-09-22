import { createEventHook, type ChangeOrigin } from '@embedpdf/core';

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

/** A change this session made through the public API. */
export const ORIGIN_API: ChangeOrigin = {
  locality: 'local',
  trigger: 'api',
  sessionId: null,
  actorId: null,
};
/** A change this session made through a gesture or an internal path. */
export const ORIGIN_UNKNOWN: ChangeOrigin = {
  locality: 'local',
  trigger: 'unknown',
  sessionId: null,
  actorId: null,
};

/**
 * The plugin's confirmed-change events (kernel primitive; one emit per
 * confirmed fact). Created once; every area emits through these hooks and the
 * public `on…` members are their `on` doors.
 */
export function createAnnotationEvents(ctx: Pick<AnnotationContext, 'cleanup'>) {
  const report = (error: unknown) => console.error('[annotation] event listener failed:', error);
  const created = createEventHook<AnnotationCreatedEvent>(report);
  const updated = createEventHook<AnnotationUpdatedEvent>(report);
  const deleted = createEventHook<AnnotationDeletedEvent>(report);
  const resynced = createEventHook<AnnotationResyncedEvent>(report);
  const selectionChanged = createEventHook<AnnotationSelectionChangedEvent>(report);
  const draftChanged = createEventHook<AnnotationDraftChangedEvent>(report);
  const editingChanged = createEventHook<AnnotationEditingChangedEvent>(report);
  const threadChanged = createEventHook<CommentThreadChangedEvent>(report);
  const draftCaptured = createEventHook<CapturedAnnotationDraft>(report);
  const all = [
    created,
    updated,
    deleted,
    resynced,
    selectionChanged,
    draftChanged,
    editingChanged,
    threadChanged,
    draftCaptured,
  ];
  ctx.cleanup(() => {
    for (const hook of all) hook.dispose();
  });
  return {
    created,
    updated,
    deleted,
    resynced,
    selectionChanged,
    draftChanged,
    editingChanged,
    threadChanged,
    draftCaptured,
  };
}

export type AnnotationEvents = ReturnType<typeof createAnnotationEvents>;
