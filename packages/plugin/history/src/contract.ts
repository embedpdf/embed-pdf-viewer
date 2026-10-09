/**
 * The history's public contract: one undo and redo history per open
 * document, of the changes this session made through the viewer.
 */
import type { ChangeLabel, DeepPartial, EventHook, PluginError, SettingsApi } from '@embedpdf/core';

export { HistoryToken } from './token';

/**
 * The history's settings: {@link HISTORY_DEFAULTS}, with what the app registers merged over
 * them; `updateSettings()` changes them for every document while the app runs.
 */
export interface HistorySettings {
  /** How many steps undo can go back. The oldest go first. */
  readonly limit: number;
}

export const HISTORY_DEFAULTS: HistorySettings = { limit: 100 };

/** What `historyPlugin(config)` takes: any of the settings, merged over the defaults. */
export type HistoryConfig = DeepPartial<HistorySettings>;

/** An undo or a redo the engine answered. */
export interface HistoryUndoneEvent {
  /** What was undone or redone, as the change was called: `{ key: 'annotation.move', count: 3 }`. */
  readonly label: ChangeLabel;
  /** Whether it was a redo. */
  readonly redo: boolean;
  /**
   * How many of its parts were left alone, in whole or in part, because someone changed them
   * since: "Some changes weren't undone because they were changed by someone else". `0` when
   * everything was undone.
   */
  readonly skipped: number;
}

/** An undo or a redo the engine refused. */
export interface HistoryUndoFailedEvent {
  readonly label: ChangeLabel;
  readonly redo: boolean;
  /**
   * `'unavailable'`: it can't be undone any more (a redaction, flattening, signing or form
   * repair came after it, a new version was published, or it is too old), and the history
   * forgot it and everything before it. `'refused'`: the engine refused it for another reason
   * (`error` says which), and the history kept it: it can be tried again.
   */
  readonly reason: 'unavailable' | 'refused';
  readonly error: PluginError;
}

export interface HistoryCapability extends SettingsApi<HistorySettings> {
  /**
   * Undo the last step, at once: the document shows it undone straight away, and the engine
   * is asked after everything staged before it. A step whose change is still on its way is
   * undone the same way. Does nothing when there is nothing to undo. `onUndone` or
   * `onUndoFailed` follows once the engine answered.
   */
  undo(): void;
  /** Redo the last step undone, the same way. Does nothing when there is nothing to redo. */
  redo(): void;
  canUndo(): boolean;
  canRedo(): boolean;
  /** What undo would undo, for a tooltip ("Undo move of 3 annotations"), or `null`. */
  getUndoLabel(): ChangeLabel | null;
  /** What redo would redo, or `null`. */
  getRedoLabel(): ChangeLabel | null;
  /** Forget every step: nothing can be undone or redone until the next change. */
  clear(): void;
  readonly onUndone: EventHook<HistoryUndoneEvent>;
  readonly onUndoFailed: EventHook<HistoryUndoFailedEvent>;
}
