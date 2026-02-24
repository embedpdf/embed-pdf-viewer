import { BasePlugin, createEmitter, Listener, PluginRegistry } from '@embedpdf/core';
import {
  Command,
  HistoryCapability,
  HistoryChangeEvent,
  HistoryDocumentState,
  HistoryEntry,
  HistoryPluginConfig,
  HistoryScope,
  HistoryState,
} from './types';
import {
  HistoryAction,
  initHistoryState,
  cleanupHistoryState,
  setHistoryDocumentState,
} from './actions';

interface DocumentHistoryData {
  topicHistories: Map<string, { commands: Command[]; currentIndex: number }>;
  globalTimeline: HistoryEntry[];
  globalIndex: number;
}

export class HistoryPlugin extends BasePlugin<
  HistoryPluginConfig,
  HistoryCapability,
  HistoryState,
  HistoryAction
> {
  static readonly id = 'history' as const;

  // Per-document history data (persisted with state)
  private readonly documentHistories = new Map<string, DocumentHistoryData>();

  // Event emitter for history changes
  private readonly historyChange$ = createEmitter<HistoryChangeEvent>();

  constructor(id: string, registry: PluginRegistry) {
    super(id, registry);
  }

  async initialize(_: HistoryPluginConfig): Promise<void> {
    this.logger.info('HistoryPlugin', 'Initialize', 'History plugin initialized');
  }

  // ─────────────────────────────────────────────────────────
  // Document Lifecycle (from BasePlugin)
  // ─────────────────────────────────────────────────────────

  protected override onDocumentLoadingStarted(documentId: string): void {
    // Initialize history state for this document
    this.dispatch(initHistoryState(documentId));

    // Create document history data
    this.documentHistories.set(documentId, {
      topicHistories: new Map(),
      globalTimeline: [],
      globalIndex: -1,
    });

    this.logger.debug(
      'HistoryPlugin',
      'DocumentOpened',
      `Initialized history state for document: ${documentId}`,
    );
  }

  protected override onDocumentClosed(documentId: string): void {
    // Cleanup history state
    this.dispatch(cleanupHistoryState(documentId));

    // Cleanup document history data
    this.documentHistories.delete(documentId);

    this.logger.debug(
      'HistoryPlugin',
      'DocumentClosed',
      `Cleaned up history state for document: ${documentId}`,
    );
  }

  // ─────────────────────────────────────────────────────────
  // Helper Methods
  // ─────────────────────────────────────────────────────────

  private getDocumentHistoryData(documentId?: string): DocumentHistoryData {
    const id = documentId ?? this.getActiveDocumentId();
    const data = this.documentHistories.get(id);
    if (!data) {
      throw new Error(`History data not found for document: ${id}`);
    }
    return data;
  }

  private getDocumentHistoryState(documentId: string): HistoryDocumentState {
    const data = this.documentHistories.get(documentId);
    if (!data) {
      throw new Error(`History data not found for document: ${documentId}`);
    }

    const topics: HistoryDocumentState['topics'] = {};
    Array.from(data.topicHistories.entries()).forEach(([topic, history]) => {
      topics[topic] = {
        canUndo: history.currentIndex > -1,
        canRedo: history.currentIndex < history.commands.length - 1,
      };
    });

    return {
      global: {
        canUndo: data.globalIndex > -1,
        canRedo: data.globalIndex < data.globalTimeline.length - 1,
      },
      topics,
    };
  }

  private emitHistoryChange(documentId: string, topic: string | undefined) {
    // Update the state
    const state = this.getDocumentHistoryState(documentId);
    this.dispatch(setHistoryDocumentState(documentId, state));

    // Emit the event
    this.historyChange$.emit({
      documentId,
      topic,
      state,
    });
  }

  // ─────────────────────────────────────────────────────────
  // History Operations (per document)
  // ─────────────────────────────────────────────────────────

  private register(command: Command, topic: string, documentId: string): void {
    const data = this.getDocumentHistoryData(documentId);

    // 1. Manage Topic History
    if (!data.topicHistories.has(topic)) {
      data.topicHistories.set(topic, { commands: [], currentIndex: -1 });
    }
    const topicHistory = data.topicHistories.get(topic)!;
    topicHistory.commands.splice(topicHistory.currentIndex + 1);
    topicHistory.commands.push(command);
    topicHistory.currentIndex++;

    // 2. Manage Global History
    const historyEntry: HistoryEntry = { command, topic };
    data.globalTimeline.splice(data.globalIndex + 1);
    data.globalTimeline.push(historyEntry);
    data.globalIndex++;

    // 3. Execute and notify with the specific topic
    command.execute();
    this.emitHistoryChange(documentId, topic);
  }

  private undo(topic: string | undefined, documentId: string): void {
    const data = this.getDocumentHistoryData(documentId);
    let affectedTopic: string | undefined;

    if (topic) {
      // Scoped Undo
      const topicHistory = data.topicHistories.get(topic);
      if (topicHistory && topicHistory.currentIndex > -1) {
        topicHistory.commands[topicHistory.currentIndex].undo();
        topicHistory.currentIndex--;
        affectedTopic = topic;
      }
    } else {
      // Global Undo
      if (data.globalIndex > -1) {
        const entry = data.globalTimeline[data.globalIndex];
        entry.command.undo();
        data.topicHistories.get(entry.topic)!.currentIndex--;
        data.globalIndex--;
        affectedTopic = entry.topic;
      }
    }

    if (affectedTopic) {
      this.emitHistoryChange(documentId, affectedTopic);
    }
  }

  private redo(topic: string | undefined, documentId: string): void {
    const data = this.getDocumentHistoryData(documentId);
    let affectedTopic: string | undefined;

    if (topic) {
      // Scoped Redo
      const topicHistory = data.topicHistories.get(topic);
      if (topicHistory && topicHistory.currentIndex < topicHistory.commands.length - 1) {
        topicHistory.currentIndex++;
        topicHistory.commands[topicHistory.currentIndex].execute();
        affectedTopic = topic;
      }
    } else {
      // Global Redo
      if (data.globalIndex < data.globalTimeline.length - 1) {
        data.globalIndex++;
        const entry = data.globalTimeline[data.globalIndex];
        entry.command.execute();
        data.topicHistories.get(entry.topic)!.currentIndex++;
        affectedTopic = entry.topic;
      }
    }

    if (affectedTopic) {
      this.emitHistoryChange(documentId, affectedTopic);
    }
  }

  private canUndo(topic: string | undefined, documentId: string): boolean {
    const data = this.getDocumentHistoryData(documentId);

    if (topic) {
      const history = data.topicHistories.get(topic);
      return !!history && history.currentIndex > -1;
    }
    return data.globalIndex > -1;
  }

  private canRedo(topic: string | undefined, documentId: string): boolean {
    const data = this.getDocumentHistoryData(documentId);

    if (topic) {
      const history = data.topicHistories.get(topic);
      return !!history && history.currentIndex < history.commands.length - 1;
    }
    return data.globalIndex < data.globalTimeline.length - 1;
  }

  /**
   * Purges history entries that match the given predicate based on command metadata.
   * Used to remove commands that are no longer valid (e.g., after a permanent redaction commit).
   *
   * @param predicate A function that returns true for commands that should be purged
   * @param topic If provided, only purges entries for that specific topic
   * @param documentId The document to purge history for
   * @returns The number of entries that were purged
   */
  private purgeByMetadata<T>(
    predicate: (metadata: T | undefined) => boolean,
    topic: string | undefined,
    documentId: string,
  ): number {
    const data = this.getDocumentHistoryData(documentId);
    let purgedCount = 0;

    // Helper to check if a command should be purged
    const shouldPurge = (command: Command): boolean => {
      return predicate(command.metadata as T | undefined);
    };

    // 1. Purge from topic histories
    const topicsToProcess = topic ? [topic] : Array.from(data.topicHistories.keys());

    for (const topicName of topicsToProcess) {
      const topicHistory = data.topicHistories.get(topicName);
      if (!topicHistory) continue;

      const newCommands: Command[] = [];
      let indexAdjustment = 0;

      for (let i = 0; i < topicHistory.commands.length; i++) {
        const command = topicHistory.commands[i];
        if (shouldPurge(command)) {
          // If this entry is at or before currentIndex, we need to adjust
          if (i <= topicHistory.currentIndex) {
            indexAdjustment++;
          }
          purgedCount++;
        } else {
          newCommands.push(command);
        }
      }

      topicHistory.commands = newCommands;
      topicHistory.currentIndex = Math.max(-1, topicHistory.currentIndex - indexAdjustment);
    }

    // 2. Purge from global timeline
    const newTimeline: HistoryEntry[] = [];
    let globalIndexAdjustment = 0;

    for (let i = 0; i < data.globalTimeline.length; i++) {
      const entry = data.globalTimeline[i];
      const matchesTopic = !topic || entry.topic === topic;

      if (matchesTopic && shouldPurge(entry.command)) {
        // If this entry is at or before globalIndex, we need to adjust
        if (i <= data.globalIndex) {
          globalIndexAdjustment++;
        }
      } else {
        newTimeline.push(entry);
      }
    }

    data.globalTimeline = newTimeline;
    data.globalIndex = Math.max(-1, data.globalIndex - globalIndexAdjustment);

    // 3. Emit history change if anything was purged
    if (purgedCount > 0) {
      this.emitHistoryChange(documentId, topic);
      this.logger.debug(
        'HistoryPlugin',
        'PurgeByMetadata',
        `Purged ${purgedCount} history entries for document: ${documentId}${topic ? `, topic: ${topic}` : ''}`,
      );
    }

    return purgedCount;
  }

  // ─────────────────────────────────────────────────────────
  // Document Scoping
  // ─────────────────────────────────────────────────────────

  private createHistoryScope(documentId: string): HistoryScope {
    return {
      register: (command: Command, topic: string) => this.register(command, topic, documentId),
      undo: (topic?: string) => this.undo(topic, documentId),
      redo: (topic?: string) => this.redo(topic, documentId),
      canUndo: (topic?: string) => this.canUndo(topic, documentId),
      canRedo: (topic?: string) => this.canRedo(topic, documentId),
      getHistoryState: () => this.getDocumentHistoryState(documentId),
      onHistoryChange: (listener: Listener<string | undefined>) =>
        this.historyChange$.on((event) => {
          if (event.documentId === documentId) {
            listener(event.topic);
          }
        }),
      purgeByMetadata: <T>(predicate: (metadata: T | undefined) => boolean, topic?: string) =>
        this.purgeByMetadata(predicate, topic, documentId),
    };
  }

  // ─────────────────────────────────────────────────────────
  // Capability
  // ─────────────────────────────────────────────────────────

  protected buildCapability(): HistoryCapability {
    return {
      // Active document operations
      register: (command: Command, topic: string) => {
        const documentId = this.getActiveDocumentId();
        this.register(command, topic, documentId);
      },

      undo: (topic?: string) => {
        const documentId = this.getActiveDocumentId();
        this.undo(topic, documentId);
      },

      redo: (topic?: string) => {
        const documentId = this.getActiveDocumentId();
        this.redo(topic, documentId);
      },

      canUndo: (topic?: string) => {
        const documentId = this.getActiveDocumentId();
        return this.canUndo(topic, documentId);
      },

      canRedo: (topic?: string) => {
        const documentId = this.getActiveDocumentId();
        return this.canRedo(topic, documentId);
      },

      getHistoryState: () => {
        const documentId = this.getActiveDocumentId();
        return this.getDocumentHistoryState(documentId);
      },

      // Document-scoped operations
      forDocument: (documentId: string) => this.createHistoryScope(documentId),

      // Events
      onHistoryChange: this.historyChange$.on,

      // Purge operations
      purgeByMetadata: <T>(predicate: (metadata: T | undefined) => boolean, topic?: string) => {
        const documentId = this.getActiveDocumentId();
        return this.purgeByMetadata(predicate, topic, documentId);
      },
    };
  }

  // ─────────────────────────────────────────────────────────
  // Lifecycle
  // ─────────────────────────────────────────────────────────

  async destroy(): Promise<void> {
    // Clear all emitters
    this.historyChange$.clear();

    // Clear document histories
    this.documentHistories.clear();

    super.destroy();
  }
}
