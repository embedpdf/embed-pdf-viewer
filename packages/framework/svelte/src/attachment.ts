/**
 * @embedpdf/svelte/attachment — the files a document carries.
 *
 * Reading the state reads the document's attachments; the plugin keeps them live off the
 * document's event stream, lists the pages' files with them, and shows your own adds and removes
 * at once:
 *
 *   const attachment = useAttachment();
 *   const state = useAttachmentState(); // state.files, state.canAdd
 *   const { bytes, name, mimeType } = await attachment.download(file);
 */

// Registration travels with the UI.
export * from '@embedpdf/plugin-attachment';

export { useAttachment, useAttachmentEvent, useAttachmentState } from './attachment/readers';
