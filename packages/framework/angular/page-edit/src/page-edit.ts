/**
 * The page-edit plugin's service and feature. The plugin turns a page relative to its rotation
 * and resolves where pages go, so the service is the plugin's calls and nothing more:
 *
 *   await pageEdit.rotateBy([page.ref], 90);
 */
import { Injectable } from '@angular/core';
import { pluginService, type EmbedPdfFeature } from '@embedpdf/angular/runtime';
import { pageEditPlugin, PageEditToken } from '@embedpdf/plugin-page-edit';

/**
 * The page edits of the document in scope (`[epdfDocumentScope]`), else the active one. The
 * checks `canEdit()` and `canExtract()` follow the document when a template reads them; with no
 * document every call refuses with `not-ready`. The plugin has no state or events of its own:
 * page changes are document events (`inject(EpdfDocuments).pagesChanged$`), and the pages are
 * `inject(EpdfDocument).pages()`.
 */
@Injectable({ providedIn: 'root' })
export class EpdfPageEdit extends pluginService({
  name: 'EpdfPageEdit',
  feature: 'withPageEdit()',
  token: PageEditToken,
  methods: [
    'rotateBy',
    'setRotation',
    'reorder',
    'delete',
    'insertBlank',
    'insertFromBytes',
    'insertFromDocument',
    'duplicate',
    'extract',
    'canEdit',
    'canExtract',
  ],
}) {}

/** Page editing, for `provideEmbedPdf()`. */
export function withPageEdit(): EmbedPdfFeature {
  return { plugins: [pageEditPlugin()], services: [EpdfPageEdit] };
}
