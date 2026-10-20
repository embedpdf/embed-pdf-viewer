/**
 * The React surface for @embedpdf/plugin-attachment: the capability, the
 * state declared once in `attachmentState`, and its events. Reading the state
 * reads the document's attachments; the plugin keeps them live off the
 * document event stream, lists the pages' files with them, and shows your own
 * adds and removes at once.
 *
 *   const attachment = useAttachment();
 *   const { files, canAdd } = useAttachmentState();
 *   const { bytes, name, mimeType } = await attachment.download(file);
 */

// One-line-per-feature: registration travels with the UI.
export * from '@embedpdf/plugin-attachment';
import type { EventHook } from '@embedpdf/core';
import {
  AttachmentToken,
  attachmentState,
  type AttachmentCapability,
} from '@embedpdf/plugin-attachment';

import { useCapability, useCapabilityEvent } from './runtime';
import { stateHook } from './state';

/**
 * The attachment capability (add, remove, download, reveal) of the
 * surrounding `<DocumentScope>`'s document, else the active one. Outside a
 * document, every method throws `not-ready`.
 */
export function useAttachment(): AttachmentCapability {
  return useCapability(AttachmentToken);
}

/**
 * The files the document carries, the load state, and whether you may add
 * and save files (the page's State table, declared once in
 * `attachmentState`). Takes a selector, and re-renders only when what it
 * returns changes.
 */
export const useAttachmentState = stateHook(attachmentState);

/** Subscribe to one attachment event for the mounted lifetime: `useAttachmentEvent((attachment) => attachment.onChanged, handler)`. */
export function useAttachmentEvent<T>(
  select: (attachment: AttachmentCapability) => EventHook<T>,
  handler: (event: T) => void,
): void {
  useCapabilityEvent(AttachmentToken, select, handler);
}
