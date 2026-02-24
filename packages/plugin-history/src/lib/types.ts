import { BasePluginConfig, EventHook } from '@embedpdf/core';

export interface HistoryPluginConfig extends BasePluginConfig {}

/**
 * The core Command interface that other plugins will implement.
 * @template T - Optional metadata type for identifying/filtering commands
 */
export interface Command<T = unknown> {
  /** A function that applies the change. */
  execute(): void;
  /** A function that reverts the change. */
  undo(): void;
  /** Optional metadata for identifying/filtering commands (e.g., for purging) */
  metadata?: T;
}

/**
 * An entry in the global timeline, associating a command with its topic.
 */
export interface HistoryEntry {
  command: Command;
  topic: string;
}

/**
 * Per-document history state
 */
export interface HistoryDocumentState {
  global: {
    canUndo: boolean;
    canRedo: boolean;
  };
  topics: Record<string, { canUndo: boolean; canRedo: boolean }>;
}

/**
 * Information about the history state, to be emitted for UI updates.
 * Includes per-document history states.
 */
export interface HistoryState {
  // Per-document history state (persisted)
  documents: Record<string, HistoryDocumentState>;
  // Currently active document
  activeDocumentId: string | null;
}

/**
 * Event payload for history changes
 */
export interface HistoryChangeEvent {
  documentId: string;
  topic: string | undefined;
  state: HistoryDocumentState;
}

/**
 * Scoped history capability for a specific document
 */
export interface HistoryScope {
  /**
   * Registers a command with the history stack.
   * @param command The command to register, with `execute` and `undo` methods.
   * @param topic A string identifier for the history scope (e.g., 'annotations').
   */
  register: (command: Command, topic: string) => void;

  /**
   * Undoes the last command.
   * @param topic If provided, undoes the last command for that specific topic.
   * If omitted, performs a global undo of the very last action.
   */
  undo: (topic?: string) => void;

  /**
   * Redoes the last undone command.
   * @param topic If provided, redoes the last command for that specific topic.
   * If omitted, performs a global redo.
   */
  redo: (topic?: string) => void;

  /**
   * Checks if an undo operation is possible.
   * @param topic If provided, checks for the specific topic. Otherwise, checks globally.
   */
  canUndo: (topic?: string) => boolean;

  /**
   * Checks if a redo operation is possible.
   * @param topic If provided, checks for the specific topic. Otherwise, checks globally.
   */
  canRedo: (topic?: string) => boolean;

  /**
   * Returns the current undo/redo state for all topics and the global timeline.
   */
  getHistoryState: () => HistoryDocumentState;

  /**
   * An event hook that fires whenever a history action occurs for this document.
   * @param topic The topic string that was affected by the action.
   */
  onHistoryChange: EventHook<string | undefined>;

  /**
   * Purges history entries that match the given predicate based on command metadata.
   * Used to remove commands that are no longer valid (e.g., after a permanent redaction commit).
   * @param predicate A function that returns true for commands that should be purged
   * @param topic If provided, only purges entries for that specific topic
   * @returns The number of entries that were purged
   */
  purgeByMetadata: <T>(predicate: (metadata: T | undefined) => boolean, topic?: string) => number;
}

export interface HistoryCapability {
  /**
   * Registers a command with the history stack for the active document.
   * @param command The command to register, with `execute` and `undo` methods.
   * @param topic A string identifier for the history scope (e.g., 'annotations').
   */
  register: (command: Command, topic: string) => void;

  /**
   * Undoes the last command for the active document.
   * @param topic If provided, undoes the last command for that specific topic.
   * If omitted, performs a global undo of the very last action.
   */
  undo: (topic?: string) => void;

  /**
   * Redoes the last undone command for the active document.
   * @param topic If provided, redoes the last command for that specific topic.
   * If omitted, performs a global redo.
   */
  redo: (topic?: string) => void;

  /**
   * Checks if an undo operation is possible for the active document.
   * @param topic If provided, checks for the specific topic. Otherwise, checks globally.
   */
  canUndo: (topic?: string) => boolean;

  /**
   * Checks if a redo operation is possible for the active document.
   * @param topic If provided, checks for the specific topic. Otherwise, checks globally.
   */
  canRedo: (topic?: string) => boolean;

  /**
   * Returns the current undo/redo state for the active document.
   */
  getHistoryState: () => HistoryDocumentState;

  /**
   * Get document-scoped history operations
   */
  forDocument: (documentId: string) => HistoryScope;

  /**
   * An event hook that fires whenever a history action occurs.
   */
  onHistoryChange: EventHook<HistoryChangeEvent>;

  /**
   * Purges history entries that match the given predicate based on command metadata.
   * Used to remove commands that are no longer valid (e.g., after a permanent redaction commit).
   * @param predicate A function that returns true for commands that should be purged
   * @param topic If provided, only purges entries for that specific topic
   * @returns The number of entries that were purged
   */
  purgeByMetadata: <T>(predicate: (metadata: T | undefined) => boolean, topic?: string) => number;
}
