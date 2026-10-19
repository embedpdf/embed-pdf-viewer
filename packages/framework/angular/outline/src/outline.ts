/**
 * The outline plugin's service and feature: the document's outline (its bookmarks). Reading it
 * reads the outline; the plugin keeps it live off the document's event stream, and shows your
 * own edits at once:
 *
 *   protected readonly outline = inject(EpdfOutline);
 *   @for (row of outline.rows(); track row.item.ref.objectNumber) { … }
 *   (click)="outline.activate(row.item.ref)"   goes where the item goes, as a click does
 */
import { Injectable } from '@angular/core';
import { pluginService, type EmbedPdfFeature } from '@embedpdf/angular/runtime';
import { outlinePlugin, outlineState, OutlineToken } from '@embedpdf/plugin-outline';

/**
 * The outline of the document in scope (`[epdfDocumentScope]`), else the active one: the State
 * table as signals (`items()`, `rows()`, `current()`, `selected()`, `status()`, `incomplete()`,
 * `canEdit()`), the reads that take an item (`get()`, `getChildren()`, `isExpanded()`), the
 * calls that expand, select, follow and edit items, and the streams `changed$` and
 * `resynced$`. Reading it reads the outline. With no document the signals read empty, and every
 * call refuses with `not-ready`.
 */
@Injectable({ providedIn: 'root' })
export class EpdfOutline extends pluginService({
  name: 'EpdfOutline',
  feature: 'withOutline()',
  token: OutlineToken,
  state: outlineState,
  methods: [
    'get',
    'getChildren',
    'isExpanded',
    'getCurrentViewTarget',
    'ensureLoaded',
    'refresh',
    'expand',
    'collapse',
    'toggle',
    'expandAll',
    'collapseAll',
    'reveal',
    'select',
    'activate',
    'create',
    'update',
    'move',
    'delete',
  ],
  events: ['onChanged', 'onResynced'],
}) {}

/** The outline, for `provideEmbedPdf()`. */
export function withOutline(): EmbedPdfFeature {
  return { plugins: [outlinePlugin()], services: [EpdfOutline] };
}
