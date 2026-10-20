/**
 * The attachment plugin's service and feature: the files a document carries. Reading it reads
 * the document's attachments; the plugin keeps them live off the document's event stream, lists
 * the pages' files with them, and shows your own adds and removes at once:
 *
 *   protected readonly attachment = inject(EpdfAttachment);
 *   @for (file of attachment.files(); track file.id) { … }
 *   (click)="attachment.download(file)"   the bytes, a clean name and the type, to save
 */
import { Injectable } from '@angular/core';
import { pluginService, type EmbedPdfFeature } from '@embedpdf/angular/runtime';
import { attachmentPlugin, attachmentState, AttachmentToken } from '@embedpdf/plugin-attachment';

/**
 * The files of the document in scope (`[epdfDocumentScope]`), else the active one: the State
 * table as signals (`files()`, `status()`, `canAdd()`, `canDownload()`), the reads that take a
 * file (`get()`, `isPending()`, `canRemove()`), the calls that add, remove, save and go to
 * files, and the streams `changed$` and `resynced$`. Reading it reads the attachments. With no
 * document the signals read empty, and every call refuses with `not-ready`.
 */
@Injectable({ providedIn: 'root' })
export class EpdfAttachment extends pluginService({
  name: 'EpdfAttachment',
  feature: 'withAttachment()',
  token: AttachmentToken,
  state: attachmentState,
  methods: [
    'get',
    'isPending',
    'canRemove',
    'ensureLoaded',
    'refresh',
    'add',
    'remove',
    'download',
    'reveal',
  ],
  events: ['onChanged', 'onResynced'],
}) {}

/** The attachments, for `provideEmbedPdf()`. */
export function withAttachment(): EmbedPdfFeature {
  return { plugins: [attachmentPlugin()], services: [EpdfAttachment] };
}
