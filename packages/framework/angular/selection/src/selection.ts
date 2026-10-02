/**
 * The selection plugin's service and feature:
 *
 *   withSelection(options)      the plugin, for provideEmbedPdf() (it needs withInteraction())
 *   inject(EpdfSelection)       select from code, read the selected text, the State table as
 *                               signals (`hasSelection()`, `isSelecting()`, `range()`, `pages()`),
 *                               `changed$` / `committed$` / `cleared$`, and the settings
 */
import { Injectable } from '@angular/core';
import { pluginService, type EmbedPdfFeature } from '@embedpdf/angular/runtime';
import {
  selectionPlugin,
  selectionState,
  SelectionToken,
  type SelectionConfig,
} from '@embedpdf/plugin-selection';

/**
 * Text selection: `select()` and the other methods of the Selecting page, every value of its
 * State table as a signal (`selection.hasSelection()`), its events as streams
 * (`selection.committed$`), and its settings (`selection.settings()`,
 * `selection.updateSettings({ color })`). Without a document the signals read empty and the
 * methods refuse with `not-ready`.
 */
@Injectable({ providedIn: 'root' })
export class EpdfSelection extends pluginService({
  name: 'EpdfSelection',
  feature: 'withSelection()',
  token: SelectionToken,
  state: selectionState,
  methods: [
    'select',
    'selectWordAt',
    'selectLineAt',
    'selectPage',
    'selectAll',
    'extendTo',
    'clear',
    'readText',
    'readTextInRange',
    'listSegments',
    'listRects',
    'getAnchor',
    'getSnapshot',
    'getRange',
    'listSelectedPages',
    'canSelect',
    'canCopy',
  ],
  events: ['onChanged', 'onCommitted', 'onCleared'],
}) {}

/**
 * The selection plugin: selecting text with the pointer, a finger and from code. It works with
 * the interaction plugin, so give `withInteraction()` too:
 * `provideEmbedPdf({ engine }, withStage(), withInteraction(), withSelection())`.
 */
export function withSelection(options?: SelectionConfig): EmbedPdfFeature {
  return { plugins: [selectionPlugin(options)], services: [EpdfSelection] };
}
