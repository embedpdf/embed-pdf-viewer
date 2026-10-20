/**
 * @embedpdf/plugin-attachment: the files a document carries, in its
 * attachments and in file attachment annotations, as one list; adding and
 * removing attachments as undoable changes, and saving any file.
 * Layout: contract.ts · model.ts · controller.ts · state.ts · attachment.plugin.ts.
 */
export { attachmentPlugin } from './attachment.plugin';
export { attachmentState } from './state';
export * from './contract';
