/**
 * The view manager's service and feature: which documents each pane shows, and which pane has
 * the focus. The plugin belongs to the whole viewer, not to one document, so the service reads
 * the same panes wherever it's injected.
 */
import { Injectable } from '@angular/core';
import { pluginService, type EmbedPdfFeature } from '@embedpdf/angular/runtime';
import {
  viewManagerPlugin,
  viewManagerState,
  ViewManagerToken,
} from '@embedpdf/plugin-view-manager';

/**
 * The panes: `panes()` and `focusedPaneId()` as signals, the calls that split, close and move
 * panes and their tabs, and the streams `paneCreated$`, `paneRemoved$`, `focusChanged$` and
 * `documentMoved$`. Without the viewer started, `panes()` is empty.
 */
@Injectable({ providedIn: 'root' })
export class EpdfViewManager extends pluginService({
  name: 'EpdfViewManager',
  feature: 'withViewManager()',
  token: ViewManagerToken,
  state: viewManagerState,
  methods: [
    'listPanes',
    'getPane',
    'getPaneOrder',
    'getFocusedPaneId',
    'getPaneOfDocument',
    'createPane',
    'removePane',
    'movePane',
    'setFocusedPane',
    'splitPane',
    'setActiveDocument',
    'addDocument',
    'removeDocument',
    'moveDocumentWithin',
    'moveDocumentBetween',
  ],
  events: ['onPaneCreated', 'onPaneRemoved', 'onFocusChanged', 'onDocumentMoved'],
}) {}

/** The view manager, for `provideEmbedPdf()`: every document opens in the focused pane. */
export function withViewManager(): EmbedPdfFeature {
  return { plugins: [viewManagerPlugin()], services: [EpdfViewManager] };
}
