/**
 * @embedpdf/vue/attachment: the Vue view of `@embedpdf/plugin-attachment`.
 * Reading the state reads the document's attachments; the plugin keeps them
 * live off the document's event stream, lists the pages' files with them, and
 * shows your own adds and removes at once.
 *
 *   const attachment = useAttachment();
 *   const { files, canAdd } = useAttachmentState();
 *   const { bytes, name, mimeType } = await attachment.download(file);
 */

// One line per feature: registration travels with the UI.
export * from '@embedpdf/plugin-attachment';
import type { EventHook } from '@embedpdf/core';
import { AttachmentToken, attachmentState } from '@embedpdf/plugin-attachment';
import type { AttachmentCapability } from '@embedpdf/plugin-attachment';

import { useCapability, useCapabilityEvent } from './runtime/capabilities';
import { stateComposable } from './state';

/**
 * The attachment API (add, remove, download, reveal) of the nearest
 * `<DocumentScope>`'s document, else the active one. The object never
 * changes; outside a document every method throws `not-ready`.
 */
export function useAttachment(): AttachmentCapability {
  return useCapability(AttachmentToken);
}

/**
 * The files the document carries, the load state, and whether you may add and
 * save files, as refs (the page's State table, declared once in
 * `attachmentState`). With a selector, one ref for the value it picks, which
 * updates only when that value changes.
 */
export const useAttachmentState = stateComposable(attachmentState);

/** Subscribe to one attachment event while the component lives: `useAttachmentEvent((attachment) => attachment.onChanged, handler)`. */
export function useAttachmentEvent<Event>(
  select: (attachment: AttachmentCapability) => EventHook<Event>,
  handler: (event: Event) => void,
): void {
  useCapabilityEvent(AttachmentToken, select, handler);
}
