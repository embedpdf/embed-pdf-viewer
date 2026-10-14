/**
 * The history plugin's service and feature: undo and redo of what you change through the viewer,
 * one history per open document. An action shows undone at once, even while it is still on its
 * way to the engine:
 *
 *   protected readonly history = inject(EpdfHistory);
 *   <button [disabled]="!history.canUndo()" (click)="history.undo()">Undo</button>
 */
import { Injectable } from '@angular/core';
import { pluginService, type EmbedPdfFeature } from '@embedpdf/angular/runtime';
import {
  historyPlugin,
  historyState,
  HistoryToken,
  type HistoryConfig,
} from '@embedpdf/plugin-history';

/**
 * The history of the document in scope (`[epdfDocumentScope]`), else the active one: `undo()`,
 * `redo()`, `clear()`, the State table as signals (`canUndo()`, `canRedo()`, `undoLabel()`,
 * `redoLabel()`), the streams `undone$` and `undoFailed$`, and the settings. With no document
 * the signals read false and null, and every call refuses with `not-ready`.
 */
@Injectable({ providedIn: 'root' })
export class EpdfHistory extends pluginService({
  name: 'EpdfHistory',
  feature: 'withHistory()',
  token: HistoryToken,
  state: historyState,
  methods: ['undo', 'redo', 'clear', 'getUndoLabel', 'getRedoLabel'],
  events: ['onUndone', 'onUndoFailed'],
}) {}

/** Undo and redo, with their settings: `withHistory({ limit: 200 })`. */
export function withHistory(options?: HistoryConfig): EmbedPdfFeature {
  return { plugins: [historyPlugin(options)], services: [EpdfHistory] };
}
