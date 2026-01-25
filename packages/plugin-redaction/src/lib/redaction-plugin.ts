import {
  RedactionPluginConfig,
  RedactionCapability,
  RedactionState,
  RegisterMarqueeOnPageOptions,
  RedactionItem,
  SelectedRedaction,
  RedactionMode,
  RedactionEvent,
  RedactionScope,
  StateChangeEvent,
  PendingChangeEvent,
  SelectedChangeEvent,
  RedactionDocumentState,
} from './types';
import {
  BasePlugin,
  createBehaviorEmitter,
  PluginRegistry,
  refreshPages,
  Listener,
} from '@embedpdf/core';
import {
  PdfErrorCode,
  PdfErrorReason,
  PdfPermissionFlag,
  PdfTask,
  PdfTaskHelper,
  Rect,
  Task,
  uuidV4,
} from '@embedpdf/models';
import {
  FormattedSelection,
  SelectionCapability,
  SelectionPlugin,
} from '@embedpdf/plugin-selection';
import {
  InteractionManagerCapability,
  InteractionManagerPlugin,
} from '@embedpdf/plugin-interaction-manager';
import { AnnotationCapability, AnnotationPlugin } from '@embedpdf/plugin-annotation';
import {
  addPending,
  clearPending,
  deselectPending,
  endRedaction,
  removePending,
  selectPending,
  startRedaction,
  initRedactionState,
  cleanupRedactionState,
  RedactionAction,
} from './actions';
import { createMarqueeHandler } from './handlers';
import { initialDocumentState } from './reducer';
import { redactTools } from './tools';

export class RedactionPlugin extends BasePlugin<
  RedactionPluginConfig,
  RedactionCapability,
  RedactionState,
  RedactionAction
> {
  static readonly id = 'redaction' as const;

  private config: RedactionPluginConfig;
  private selectionCapability: SelectionCapability | undefined;
  private interactionManagerCapability: InteractionManagerCapability | undefined;
  private annotationCapability: AnnotationCapability | undefined;

  // Per-document emitters
  private readonly redactionSelection$ = new Map<
    string,
    ReturnType<typeof createBehaviorEmitter<FormattedSelection[]>>
  >();

  // Global emitters with documentId
  private readonly pending$ = createBehaviorEmitter<PendingChangeEvent>();
  private readonly selected$ = createBehaviorEmitter<SelectedChangeEvent>();
  private readonly state$ = createBehaviorEmitter<StateChangeEvent>();
  private readonly events$ = createBehaviorEmitter<RedactionEvent>();

  // Per-document unsubscribe functions
  private readonly documentUnsubscribers = new Map<string, Array<() => void>>();

  constructor(id: string, registry: PluginRegistry, config: RedactionPluginConfig) {
    super(id, registry);
    this.config = config;

    this.selectionCapability = this.registry.getPlugin<SelectionPlugin>('selection')?.provides();
    this.interactionManagerCapability = this.registry
      .getPlugin<InteractionManagerPlugin>('interaction-manager')
      ?.provides();
    this.annotationCapability = this.registry.getPlugin<AnnotationPlugin>('annotation')?.provides();

    // Register redact tools with annotation plugin
    if (this.annotationCapability) {
      for (const tool of redactTools) {
        this.annotationCapability.addTool(tool);
      }
    }

    if (this.interactionManagerCapability) {
      this.interactionManagerCapability.registerMode({
        id: RedactionMode.MarqueeRedact,
        scope: 'page',
        exclusive: true,
        cursor: 'crosshair',
      });
      this.interactionManagerCapability.registerMode({
        id: RedactionMode.RedactSelection,
        scope: 'page',
        exclusive: false,
      });
    }

    // Listen to mode changes per document
    this.interactionManagerCapability?.onModeChange((modeState) => {
      const documentId = modeState.documentId;

      if (modeState.activeMode === RedactionMode.RedactSelection) {
        this.dispatch(startRedaction(documentId, RedactionMode.RedactSelection));
      } else if (modeState.activeMode === RedactionMode.MarqueeRedact) {
        this.dispatch(startRedaction(documentId, RedactionMode.MarqueeRedact));
      } else {
        const docState = this.getDocumentState(documentId);
        if (docState?.isRedacting) {
          this.dispatch(endRedaction(documentId));
        }
      }
    });
  }

  // ─────────────────────────────────────────────────────────
  // Document Lifecycle Hooks (from BasePlugin)
  // ─────────────────────────────────────────────────────────

  protected override onDocumentLoadingStarted(documentId: string): void {
    // Initialize state for this document
    this.dispatch(
      initRedactionState(documentId, {
        ...initialDocumentState,
      }),
    );

    // Create per-document emitter
    this.redactionSelection$.set(documentId, createBehaviorEmitter<FormattedSelection[]>());
    // Setup selection listeners for this document
    const unsubscribers: Array<() => void> = [];

    if (this.selectionCapability) {
      const selectionScope = this.selectionCapability.forDocument(documentId);

      // Listen to selection changes
      const unsubSelection = selectionScope.onSelectionChange(() => {
        const docState = this.getDocumentState(documentId);
        if (!docState?.isRedacting) return;

        const formattedSelection = selectionScope.getFormattedSelection();
        const emitter = this.redactionSelection$.get(documentId);
        emitter?.emit(formattedSelection);
      });

      // Listen to end selection
      const unsubEndSelection = selectionScope.onEndSelection(() => {
        const docState = this.getDocumentState(documentId);
        if (!docState?.isRedacting) return;

        // Prevent creating redactions without permission
        if (!this.checkPermission(documentId, PdfPermissionFlag.ModifyContents)) {
          return;
        }

        const formattedSelection = selectionScope.getFormattedSelection();

        const items: RedactionItem[] = formattedSelection.map((s) => ({
          id: uuidV4(),
          kind: 'text',
          page: s.pageIndex,
          rect: s.rect,
          rects: s.segmentRects,
        }));

        this.dispatch(addPending(documentId, items));
        const emitter = this.redactionSelection$.get(documentId);
        emitter?.emit([]);
        selectionScope.clear();

        this.emitPendingChange(documentId);

        if (items.length) {
          this.selectPending(items[items.length - 1].page, items[items.length - 1].id, documentId);
        }
      });

      unsubscribers.push(unsubSelection, unsubEndSelection);
    }

    this.documentUnsubscribers.set(documentId, unsubscribers);

    this.logger.debug(
      'RedactionPlugin',
      'DocumentOpened',
      `Initialized redaction state for document: ${documentId}`,
    );
  }

  protected override onDocumentLoaded(documentId: string): void {
    // Redaction plugin renders its own selection rects, so suppress selection layer rects
    this.selectionCapability?.enableForMode(
      RedactionMode.RedactSelection,
      { showRects: false },
      documentId,
    );
  }

  protected override onDocumentClosed(documentId: string): void {
    // Cleanup state
    this.dispatch(cleanupRedactionState(documentId));

    // Cleanup emitters
    const emitter = this.redactionSelection$.get(documentId);
    emitter?.clear();
    this.redactionSelection$.delete(documentId);

    // Cleanup unsubscribers
    const unsubscribers = this.documentUnsubscribers.get(documentId);
    if (unsubscribers) {
      unsubscribers.forEach((unsub) => unsub());
      this.documentUnsubscribers.delete(documentId);
    }

    this.logger.debug(
      'RedactionPlugin',
      'DocumentClosed',
      `Cleaned up redaction state for document: ${documentId}`,
    );
  }

  // ─────────────────────────────────────────────────────────
  // Capability
  // ─────────────────────────────────────────────────────────

  async initialize(_config: RedactionPluginConfig): Promise<void> {
    this.logger.info('RedactionPlugin', 'Initialize', 'Redaction plugin initialized');
  }

  protected buildCapability(): RedactionCapability {
    return {
      // Active document operations
      queueCurrentSelectionAsPending: () => this.queueCurrentSelectionAsPending(),

      enableMarqueeRedact: () => this.enableMarqueeRedact(),
      toggleMarqueeRedact: () => this.toggleMarqueeRedact(),
      isMarqueeRedactActive: () => this.isMarqueeRedactActive(),

      enableRedactSelection: () => this.enableRedactSelection(),
      toggleRedactSelection: () => this.toggleRedactSelection(),
      isRedactSelectionActive: () => this.isRedactSelectionActive(),

      addPending: (items) => this.addPendingItems(items),
      removePending: (page, id) => this.removePendingItem(page, id),
      clearPending: () => this.clearPendingItems(),
      commitAllPending: () => this.commitAllPending(),
      commitPending: (page, id) => this.commitPendingOne(page, id),

      endRedaction: () => this.endRedactionMode(),
      startRedaction: () => this.startRedactionMode(),

      selectPending: (page, id) => this.selectPending(page, id),
      getSelectedPending: () => this.getSelectedPending(),
      deselectPending: () => this.deselectPending(),

      getState: () => this.getDocumentStateOrThrow(),

      // Document-scoped operations
      forDocument: (documentId: string) => this.createRedactionScope(documentId),

      // Events
      onPendingChange: this.pending$.on,
      onSelectedChange: this.selected$.on,
      onRedactionEvent: this.events$.on,
      onStateChange: this.state$.on,
    };
  }

  // ─────────────────────────────────────────────────────────
  // Document Scoping
  // ─────────────────────────────────────────────────────────

  private createRedactionScope(documentId: string): RedactionScope {
    return {
      queueCurrentSelectionAsPending: () => this.queueCurrentSelectionAsPending(documentId),

      enableMarqueeRedact: () => this.enableMarqueeRedact(documentId),
      toggleMarqueeRedact: () => this.toggleMarqueeRedact(documentId),
      isMarqueeRedactActive: () => this.isMarqueeRedactActive(documentId),

      enableRedactSelection: () => this.enableRedactSelection(documentId),
      toggleRedactSelection: () => this.toggleRedactSelection(documentId),
      isRedactSelectionActive: () => this.isRedactSelectionActive(documentId),

      addPending: (items) => this.addPendingItems(items, documentId),
      removePending: (page, id) => this.removePendingItem(page, id, documentId),
      clearPending: () => this.clearPendingItems(documentId),
      commitAllPending: () => this.commitAllPending(documentId),
      commitPending: (page, id) => this.commitPendingOne(page, id, documentId),

      endRedaction: () => this.endRedactionMode(documentId),
      startRedaction: () => this.startRedactionMode(documentId),

      selectPending: (page, id) => this.selectPending(page, id, documentId),
      getSelectedPending: () => this.getSelectedPending(documentId),
      deselectPending: () => this.deselectPending(documentId),

      getState: () => this.getDocumentStateOrThrow(documentId),

      onPendingChange: (listener: Listener<Record<number, RedactionItem[]>>) =>
        this.pending$.on((event) => {
          if (event.documentId === documentId) listener(event.pending);
        }),
      onSelectedChange: (listener: Listener<SelectedRedaction | null>) =>
        this.selected$.on((event) => {
          if (event.documentId === documentId) listener(event.selected);
        }),
      onRedactionEvent: (listener: Listener<RedactionEvent>) =>
        this.events$.on((event) => {
          if (event.documentId === documentId) listener(event);
        }),
      onStateChange: (listener: Listener<RedactionDocumentState>) =>
        this.state$.on((event) => {
          if (event.documentId === documentId) listener(event.state);
        }),
    };
  }

  // ─────────────────────────────────────────────────────────
  // State Helpers
  // ─────────────────────────────────────────────────────────

  private getDocumentState(documentId?: string): RedactionDocumentState | null {
    const id = documentId ?? this.getActiveDocumentId();
    return this.state.documents[id] ?? null;
  }

  private getDocumentStateOrThrow(documentId?: string): RedactionDocumentState {
    const state = this.getDocumentState(documentId);
    if (!state) {
      throw new Error(`Redaction state not found for document: ${documentId ?? 'active'}`);
    }
    return state;
  }

  // ─────────────────────────────────────────────────────────
  // Core Operations
  // ─────────────────────────────────────────────────────────

  private addPendingItems(items: RedactionItem[], documentId?: string) {
    const id = documentId ?? this.getActiveDocumentId();

    // Prevent adding redactions without permission
    if (!this.checkPermission(id, PdfPermissionFlag.ModifyContents)) {
      this.logger.debug(
        'RedactionPlugin',
        'AddPendingItems',
        `Cannot add redactions: document ${id} lacks ModifyContents permission`,
      );
      return;
    }

    this.dispatch(addPending(id, items));
    this.emitPendingChange(id);
    this.events$.emit({ type: 'add', documentId: id, items });
  }

  private removePendingItem(page: number, itemId: string, documentId?: string) {
    const id = documentId ?? this.getActiveDocumentId();
    this.dispatch(removePending(id, page, itemId));
    this.emitPendingChange(id);
    this.events$.emit({ type: 'remove', documentId: id, page, id: itemId });
  }

  private clearPendingItems(documentId?: string) {
    const id = documentId ?? this.getActiveDocumentId();
    this.dispatch(clearPending(id));
    this.emitPendingChange(id);
    this.events$.emit({ type: 'clear', documentId: id });
  }

  private selectPending(page: number, itemId: string, documentId?: string) {
    const id = documentId ?? this.getActiveDocumentId();
    this.dispatch(selectPending(id, page, itemId));
    this.selectionCapability?.forDocument(id).clear();
    this.emitSelectedChange(id);
  }

  private getSelectedPending(documentId?: string): SelectedRedaction | null {
    const id = documentId ?? this.getActiveDocumentId();
    return this.getDocumentState(id)?.selected ?? null;
  }

  private deselectPending(documentId?: string) {
    const id = documentId ?? this.getActiveDocumentId();
    this.dispatch(deselectPending(id));
    this.emitSelectedChange(id);
  }

  private enableRedactSelection(documentId?: string) {
    const id = documentId ?? this.getActiveDocumentId();

    // Prevent enabling redact selection without permission
    if (!this.checkPermission(id, PdfPermissionFlag.ModifyContents)) {
      this.logger.debug(
        'RedactionPlugin',
        'EnableRedactSelection',
        `Cannot enable redact selection: document ${id} lacks ModifyContents permission`,
      );
      return;
    }

    this.interactionManagerCapability?.forDocument(id).activate(RedactionMode.RedactSelection);
  }

  private toggleRedactSelection(documentId?: string) {
    const id = documentId ?? this.getActiveDocumentId();
    const scope = this.interactionManagerCapability?.forDocument(id);
    if (scope?.getActiveMode() === RedactionMode.RedactSelection) {
      scope.activateDefaultMode();
    } else {
      scope?.activate(RedactionMode.RedactSelection);
    }
  }

  private isRedactSelectionActive(documentId?: string): boolean {
    const id = documentId ?? this.getActiveDocumentId();
    return (
      this.interactionManagerCapability?.forDocument(id).getActiveMode() ===
      RedactionMode.RedactSelection
    );
  }

  private enableMarqueeRedact(documentId?: string) {
    const id = documentId ?? this.getActiveDocumentId();

    // Prevent enabling marquee redact without permission
    if (!this.checkPermission(id, PdfPermissionFlag.ModifyContents)) {
      this.logger.debug(
        'RedactionPlugin',
        'EnableMarqueeRedact',
        `Cannot enable marquee redact: document ${id} lacks ModifyContents permission`,
      );
      return;
    }

    this.interactionManagerCapability?.forDocument(id).activate(RedactionMode.MarqueeRedact);
  }

  private toggleMarqueeRedact(documentId?: string) {
    const id = documentId ?? this.getActiveDocumentId();
    const scope = this.interactionManagerCapability?.forDocument(id);
    if (scope?.getActiveMode() === RedactionMode.MarqueeRedact) {
      scope.activateDefaultMode();
    } else {
      scope?.activate(RedactionMode.MarqueeRedact);
    }
  }

  private isMarqueeRedactActive(documentId?: string): boolean {
    const id = documentId ?? this.getActiveDocumentId();
    return (
      this.interactionManagerCapability?.forDocument(id).getActiveMode() ===
      RedactionMode.MarqueeRedact
    );
  }

  private startRedactionMode(documentId?: string) {
    const id = documentId ?? this.getActiveDocumentId();

    // Prevent starting redaction mode without permission
    if (!this.checkPermission(id, PdfPermissionFlag.ModifyContents)) {
      this.logger.debug(
        'RedactionPlugin',
        'StartRedactionMode',
        `Cannot start redaction mode: document ${id} lacks ModifyContents permission`,
      );
      return;
    }

    this.interactionManagerCapability?.forDocument(id).activate(RedactionMode.RedactSelection);
  }

  private endRedactionMode(documentId?: string) {
    const id = documentId ?? this.getActiveDocumentId();
    this.interactionManagerCapability?.forDocument(id).activateDefaultMode();
  }

  // ─────────────────────────────────────────────────────────
  // Public Methods
  // ─────────────────────────────────────────────────────────

  public onRedactionSelectionChange(
    documentId: string,
    callback: (formattedSelection: FormattedSelection[]) => void,
  ) {
    const emitter = this.redactionSelection$.get(documentId);
    return emitter?.on(callback) ?? (() => {});
  }

  public registerMarqueeOnPage(opts: RegisterMarqueeOnPageOptions) {
    if (!this.interactionManagerCapability) {
      this.logger.warn(
        'RedactionPlugin',
        'MissingDependency',
        'Interaction manager plugin not loaded, marquee redaction disabled',
      );
      return () => {};
    }

    const coreDoc = this.coreState.core.documents[opts.documentId];
    if (!coreDoc?.document) {
      this.logger.warn('RedactionPlugin', 'DocumentNotFound', 'Document not found');
      return () => {};
    }

    const page = coreDoc.document.pages[opts.pageIndex];
    if (!page) {
      this.logger.warn('RedactionPlugin', 'PageNotFound', `Page ${opts.pageIndex} not found`);
      return () => {};
    }

    const handlers = createMarqueeHandler({
      pageSize: page.size,
      scale: opts.scale,
      onPreview: opts.callback.onPreview,
      onCommit: (r) => {
        const item: RedactionItem = {
          id: uuidV4(),
          kind: 'area',
          page: opts.pageIndex,
          rect: r,
        };
        this.dispatch(addPending(opts.documentId, [item]));
        this.emitPendingChange(opts.documentId);
        opts.callback.onCommit?.(r);
        this.enableRedactSelection(opts.documentId);
        this.selectPending(opts.pageIndex, item.id, opts.documentId);
      },
    });

    const off = this.interactionManagerCapability.registerAlways({
      handlers: {
        onPointerDown: (_, evt) => {
          if (evt.target === evt.currentTarget) {
            this.deselectPending(opts.documentId);
          }
        },
      },
      scope: {
        type: 'page',
        documentId: opts.documentId,
        pageIndex: opts.pageIndex,
      },
    });

    const off2 = this.interactionManagerCapability.registerHandlers({
      documentId: opts.documentId,
      modeId: RedactionMode.MarqueeRedact,
      handlers,
      pageIndex: opts.pageIndex,
    });

    return () => {
      off();
      off2();
    };
  }

  private queueCurrentSelectionAsPending(documentId?: string): Task<boolean, PdfErrorReason> {
    const id = documentId ?? this.getActiveDocumentId();

    if (!this.selectionCapability)
      return PdfTaskHelper.reject({
        code: PdfErrorCode.NotFound,
        message: '[RedactionPlugin] selection plugin required',
      });

    const coreDoc = this.coreState.core.documents[id];
    if (!coreDoc?.document)
      return PdfTaskHelper.reject({ code: PdfErrorCode.NotFound, message: 'Document not found' });

    const selectionScope = this.selectionCapability.forDocument(id);
    const formatted = selectionScope.getFormattedSelection();
    if (!formatted.length) return PdfTaskHelper.resolve(true);

    const uniqueId = uuidV4();

    const items: RedactionItem[] = formatted.map((s) => ({
      id: uniqueId,
      kind: 'text',
      page: s.pageIndex,
      rect: s.rect,
      rects: s.segmentRects,
    }));

    this.enableRedactSelection(id);
    this.dispatch(addPending(id, items));
    this.emitPendingChange(id);

    // Auto-select the last one added
    const last = items[items.length - 1];
    this.selectPending(last.page, last.id, id);

    // Clear live UI selection
    const emitter = this.redactionSelection$.get(id);
    emitter?.emit([]);
    selectionScope.clear();

    return PdfTaskHelper.resolve(true);
  }

  private commitPendingOne(
    page: number,
    id: string,
    documentId?: string,
  ): Task<boolean, PdfErrorReason> {
    const docId = documentId ?? this.getActiveDocumentId();

    // Prevent committing redactions without permission
    if (!this.checkPermission(docId, PdfPermissionFlag.ModifyContents)) {
      this.logger.debug(
        'RedactionPlugin',
        'CommitPendingOne',
        `Cannot commit redaction: document ${docId} lacks ModifyContents permission`,
      );
      return PdfTaskHelper.reject({
        code: PdfErrorCode.Security,
        message: 'Document lacks ModifyContents permission',
      });
    }

    const coreDoc = this.coreState.core.documents[docId];

    if (!coreDoc?.document)
      return PdfTaskHelper.reject({ code: PdfErrorCode.NotFound, message: 'Document not found' });

    const docState = this.getDocumentState(docId);
    if (!docState) {
      return PdfTaskHelper.reject({
        code: PdfErrorCode.NotFound,
        message: 'Document state not found',
      });
    }

    const item = (docState.pending[page] ?? []).find((it) => it.id === id);
    if (!item) return PdfTaskHelper.resolve(true);

    const rects: Rect[] = item.kind === 'text' ? item.rects : [item.rect];
    const pdfPage = coreDoc.document.pages[page];
    if (!pdfPage)
      return PdfTaskHelper.reject({ code: PdfErrorCode.NotFound, message: 'Page not found' });

    const task = new Task<boolean, PdfErrorReason>();
    this.engine
      .redactTextInRects(coreDoc.document, pdfPage, rects, {
        drawBlackBoxes: this.config.drawBlackBoxes,
      })
      .wait(
        () => {
          this.dispatch(removePending(docId, page, id));
          this.emitPendingChange(docId);
          this.dispatchCoreAction(refreshPages(docId, [page]));
          this.events$.emit({ type: 'commit', documentId: docId, success: true });
          task.resolve(true);
        },
        (error) => {
          this.events$.emit({
            type: 'commit',
            documentId: docId,
            success: false,
            error: error.reason,
          });
          task.reject({ code: PdfErrorCode.Unknown, message: 'Failed to commit redactions' });
        },
      );

    return task;
  }

  private commitAllPending(documentId?: string): Task<boolean, PdfErrorReason> {
    const docId = documentId ?? this.getActiveDocumentId();

    // Prevent committing redactions without permission
    if (!this.checkPermission(docId, PdfPermissionFlag.ModifyContents)) {
      this.logger.debug(
        'RedactionPlugin',
        'CommitAllPending',
        `Cannot commit redactions: document ${docId} lacks ModifyContents permission`,
      );
      return PdfTaskHelper.reject({
        code: PdfErrorCode.Security,
        message: 'Document lacks ModifyContents permission',
      });
    }

    const coreDoc = this.coreState.core.documents[docId];

    if (!coreDoc?.document)
      return PdfTaskHelper.reject({ code: PdfErrorCode.NotFound, message: 'Document not found' });

    const docState = this.getDocumentState(docId);
    if (!docState) {
      return PdfTaskHelper.reject({
        code: PdfErrorCode.NotFound,
        message: 'Document state not found',
      });
    }

    // Group rects per page
    const perPage = new Map<number, Rect[]>();
    for (const [page, items] of Object.entries(docState.pending)) {
      const p = Number(page);
      const list = perPage.get(p) ?? [];
      for (const it of items) {
        if (it.kind === 'text') list.push(...it.rects);
        else list.push(it.rect);
      }
      perPage.set(p, list);
    }

    const pagesToRefresh = Array.from(perPage.entries())
      .filter(([_, rects]) => rects.length > 0)
      .map(([pageIndex]) => pageIndex);

    const tasks: PdfTask<boolean>[] = [];
    for (const [pageIndex, rects] of perPage) {
      const page = coreDoc.document.pages[pageIndex];
      if (!page) continue;
      if (!rects.length) continue;
      tasks.push(
        this.engine.redactTextInRects(coreDoc.document, page, rects, {
          drawBlackBoxes: this.config.drawBlackBoxes,
        }),
      );
    }

    const task = new Task<boolean, PdfErrorReason>();
    Task.all(tasks).wait(
      () => {
        this.dispatch(clearPending(docId));
        this.dispatchCoreAction(refreshPages(docId, pagesToRefresh));
        this.emitPendingChange(docId);
        this.events$.emit({ type: 'commit', documentId: docId, success: true });
        task.resolve(true);
      },
      (error) => {
        this.events$.emit({
          type: 'commit',
          documentId: docId,
          success: false,
          error: error.reason,
        });
        task.reject({ code: PdfErrorCode.Unknown, message: 'Failed to commit redactions' });
      },
    );

    return task;
  }

  // ─────────────────────────────────────────────────────────
  // Event Emission Helpers
  // ─────────────────────────────────────────────────────────

  private emitPendingChange(documentId: string) {
    const docState = this.getDocumentState(documentId);
    if (docState) {
      this.pending$.emit({ documentId, pending: docState.pending });
    }
  }

  private emitSelectedChange(documentId: string) {
    const docState = this.getDocumentState(documentId);
    if (docState) {
      this.selected$.emit({ documentId, selected: docState.selected });
    }
  }

  private emitStateChange(documentId: string) {
    const docState = this.getDocumentState(documentId);
    if (docState) {
      this.state$.emit({ documentId, state: docState });
    }
  }

  // ─────────────────────────────────────────────────────────
  // Store Update Handlers
  // ─────────────────────────────────────────────────────────

  override onStoreUpdated(_: RedactionState, newState: RedactionState): void {
    // Emit state changes for each changed document
    for (const documentId in newState.documents) {
      const docState = newState.documents[documentId];
      if (docState) {
        this.emitPendingChange(documentId);
        this.emitSelectedChange(documentId);
        this.emitStateChange(documentId);
      }
    }
  }

  // ─────────────────────────────────────────────────────────
  // Lifecycle
  // ─────────────────────────────────────────────────────────

  async destroy(): Promise<void> {
    this.pending$.clear();
    this.selected$.clear();
    this.state$.clear();
    this.events$.clear();

    // Cleanup all per-document emitters
    this.redactionSelection$.forEach((emitter) => emitter.clear());
    this.redactionSelection$.clear();

    // Cleanup all unsubscribers
    this.documentUnsubscribers.forEach((unsubscribers) => {
      unsubscribers.forEach((unsub) => unsub());
    });
    this.documentUnsubscribers.clear();

    await super.destroy();
  }
}
