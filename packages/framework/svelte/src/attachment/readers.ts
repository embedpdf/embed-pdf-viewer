/** The attachments' readers: the API, the state declared once in `attachmentState`, and its events. */
import type { EventHook } from '@embedpdf/core';
import { AttachmentToken, attachmentState } from '@embedpdf/plugin-attachment';
import type { AttachmentCapability } from '@embedpdf/plugin-attachment';

import { useCapability, useCapabilityEvent } from '../runtime/readers.svelte';
import { stateReader } from '../runtime/state.svelte';

/**
 * The attachment API (add, remove, download, reveal) of the nearest `<DocumentScope>`'s document,
 * else the active one. Outside a ready document, every method throws `not-ready`. `canAdd()` is a
 * read, so `disabled={!attachment.canAdd()}` updates by itself.
 */
export function useAttachment(): AttachmentCapability {
  return useCapability(AttachmentToken);
}

/**
 * The files the document carries, the load state, and whether you may add and save files (the
 * page's State table, declared once in `attachmentState`), as a reactive object: `state.files`.
 * With a selector, the value it picks as `{ current }`, which changes only when that value does.
 */
export const useAttachmentState = stateReader(attachmentState);

/** Subscribe to one attachment event while the component lives: `useAttachmentEvent((attachment) => attachment.onChanged, handler)`. */
export function useAttachmentEvent<T>(
  select: (attachment: AttachmentCapability) => EventHook<T>,
  handler: (event: T) => void,
): void {
  useCapabilityEvent(AttachmentToken, select, handler);
}
