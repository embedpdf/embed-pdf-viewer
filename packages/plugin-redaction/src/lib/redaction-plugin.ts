import {
  RedactionPluginConfig,
  RedactionCapability,
  RedactionState,
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
  arePropsEqual,
} from '@embedpdf/core';
import {
  PdfAnnotationSubtype,
  PdfDocumentObject,
  PdfErrorCode,
  PdfErrorReason,
  PdfPageObject,
  PdfPermissionFlag,
  PdfRedactAnnoObject,
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
import {
  AnnotationCapability,
  AnnotationCommandMetadata,
  AnnotationPlugin,
  AnnotationTool,
} from '@embedpdf/plugin-annotation';
import { HistoryCapability, HistoryPlugin } from '@embedpdf/plugin-history';
import {
  addPending,
  clearPending,
  deselectPending,
  endRedaction,
  removePending,
  updatePending,
  selectPending,
  startRedaction,
  initRedactionState,
  cleanupRedactionState,
  RedactionAction,
} from './actions';
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
  private historyCapability: HistoryCapability | undefined;

  /**
   * Determines which mode to use:
   * - true: Annotation mode (new) - uses REDACT annotations as pending state
   * - false: Legacy mode (deprecated) - uses internal pending state
   */
  private readonly useAnnotationMode: boolean;

  // Per-document emitters
  private readonly redactionSelection$ = new Map<
    string,
    ReturnType<typeof createBehaviorEmitter<FormattedSelection[]>>
  >();
  private readonly redactionMarquee$ = new Map<
    string,
    ReturnType<
      typeof createBehaviorEmitter<{ pageIndex: number; rect: Rect | null; modeId: string }>
    >
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
    this.historyCapability = this.registry.getPlugin<HistoryPlugin>('history')?.provides();

    // Determine mode based on config (default: false/legacy mode)
    if (this.config.useAnnotationMode) {
      if (this.annotationCapability) {
        this.useAnnotationMode = true;
      } else {
        this.logger.warn(
          'RedactionPlugin',
          'ConfigError',
          'useAnnotationMode is enabled but annotation plugin is not available. Falling back to legacy mode.',
        );
        this.useAnnotationMode = false;
      }
    } else {
      this.useAnnotationMode = false;
    }

    // Register redact tools with annotation plugin if in annotation mode
    if (this.useAnnotationMode) {
      for (const tool of redactTools) {
        this.annotationCapability!.addTool(tool);
      }
    }

    // Register redaction modes (same for both annotation and legacy modes)
    this.setupRedactionModes();

    // Info log when annotation plugin is available but annotation mode is not enabled
    if (!this.useAnnotationMode && this.annotationCapability) {
      this.logger.info(
        'RedactionPlugin',
        'LegacyMode',
        'Using legacy redaction mode. Set useAnnotationMode: true in config to use annotation-based redactions.',
      );
    }

    // Listen to mode changes per document
    this.setupModeChangeListener();
  }

  /**
   * Setup redaction modes - registers all interaction modes for redaction.
   * Works for both annotation mode and legacy mode.
   */
  private setupRedactionModes(): void {
    if (!this.interactionManagerCapability) return;

    // Register unified mode (recommended - supports both text and area)
    this.interactionManagerCapability.registerMode({
      id: RedactionMode.Redact,
      scope: 'page',
      exclusive: false,
      cursor: 'crosshair',
    });

    // Also register legacy modes for backwards compatibility
    this.interactionManagerCapability.registerMode({
      id: RedactionMode.MarqueeRedact,
      scope: 'page',
      exclusive: false,
      cursor: 'crosshair',
    });
    this.interactionManagerCapability.registerMode({
      id: RedactionMode.RedactSelection,
      scope: 'page',
      exclusive: false,
    });
  }

  /**
   * Setup mode change listener - handles all redaction modes
   */
  private setupModeChangeListener(): void {
    this.interactionManagerCapability?.onModeChange((modeState) => {
      const documentId = modeState.documentId;

      // Check if any redaction mode is active
      const isRedactionMode =
        modeState.activeMode === RedactionMode.Redact ||
        modeState.activeMode === RedactionMode.MarqueeRedact ||
        modeState.activeMode === RedactionMode.RedactSelection;

      if (isRedactionMode) {
        this.dispatch(startRedaction(documentId, modeState.activeMode as RedactionMode));
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

    // Create per-document emitters
    this.redactionSelection$.set(documentId, createBehaviorEmitter<FormattedSelection[]>());
    this.redactionMarquee$.set(
      documentId,
      createBehaviorEmitter<{ pageIndex: number; rect: Rect | null; modeId: string }>(),
    );
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
        if (!this.checkPermission(documentId, PdfPermissionFlag.ModifyContents)) return;

        const formattedSelection = selectionScope.getFormattedSelection();
        if (!formattedSelection.length) return;

        // Fetch selected text BEFORE clearing (async, but started now while selection exists)
        const textTask = selectionScope.getSelectedText();

        const emitter = this.redactionSelection$.get(documentId);
        emitter?.emit([]);
        selectionScope.clear();

        // Wait for text, then create redactions with text included
        textTask.wait(
          (textArr) => {
            const text = textArr.join(' ');
            this.createRedactionsFromSelection(documentId, formattedSelection, text);
          },
          () => {
            // On error, still create redactions but without text
            this.createRedactionsFromSelection(documentId, formattedSelection);
          },
        );
      });

      // Forward marquee preview rects (for MarqueeRedact component)
      const unsubMarqueeChange = selectionScope.onMarqueeChange((event) => {
        const docState = this.getDocumentState(documentId);
        if (!docState?.isRedacting) return;
        this.redactionMarquee$
          .get(documentId)
          ?.emit({ pageIndex: event.pageIndex, rect: event.rect, modeId: event.modeId });
      });

      // Create area redaction when marquee completes
      const unsubMarqueeEnd = selectionScope.onMarqueeEnd((event) => {
        const docState = this.getDocumentState(documentId);
        if (!docState?.isRedacting) return;
        if (!this.checkPermission(documentId, PdfPermissionFlag.ModifyContents)) return;

        if (this.useAnnotationMode) {
          this.createRedactAnnotationFromArea(documentId, event.pageIndex, event.rect);
        } else {
          // Legacy mode: create pending item
          const redactionColor = this.config.drawBlackBoxes ? '#000000' : 'transparent';
          const item: RedactionItem = {
            id: uuidV4(),
            kind: 'area',
            page: event.pageIndex,
            rect: event.rect,
            source: 'legacy',
            markColor: '#FF0000',
            redactionColor,
          };
          this.dispatch(addPending(documentId, [item]));
          this.selectPending(event.pageIndex, item.id, documentId);
        }
      });

      // Deselect pending redaction when clicking on empty page space
      const unsubEmptySpaceClick = selectionScope.onEmptySpaceClick(() => {
        this.deselectPending(documentId);
      });

      unsubscribers.push(
        unsubSelection,
        unsubEndSelection,
        unsubMarqueeChange,
        unsubMarqueeEnd,
        unsubEmptySpaceClick,
      );
    }

    // Setup annotation event forwarding AND state sync in annotation mode
    if (this.useAnnotationMode && this.annotationCapability) {
      const annoScope = this.annotationCapability.forDocument(documentId);

      const unsubEvents = annoScope.onAnnotationEvent((event) => {
        if (event.type === 'loaded') {
          // Sync existing REDACT annotations after initial load
          this.syncFromAnnotationLoad(documentId);
          return;
        }

        // Only process REDACT annotations
        if (event.annotation?.type !== PdfAnnotationSubtype.REDACT) return;
        const redactAnno = event.annotation as PdfRedactAnnoObject;

        if (event.type === 'create') {
          this.syncFromAnnotationCreate(documentId, redactAnno);
          this.events$.emit({
            type: 'add',
            documentId,
            items: [this.annotationToRedactionItem(redactAnno)],
          });
        } else if (event.type === 'update') {
          this.logger.debug('RedactionPlugin', 'AnnotationUpdated', {
            documentId,
            redactAnno,
            patch: event.patch as Partial<PdfRedactAnnoObject>,
          });
          this.syncFromAnnotationUpdate(
            documentId,
            redactAnno,
            event.patch as Partial<PdfRedactAnnoObject>,
          );
        } else if (event.type === 'delete') {
          this.syncFromAnnotationDelete(documentId, redactAnno);
          this.events$.emit({
            type: 'remove',
            documentId,
            page: redactAnno.pageIndex,
            id: redactAnno.id,
          });
        }
      });

      // Sync selection state when annotation selection changes
      const unsubState = annoScope.onStateChange(() => {
        this.syncSelectionFromAnnotation(documentId);
      });

      unsubscribers.push(unsubEvents, unsubState);
    }

    this.documentUnsubscribers.set(documentId, unsubscribers);

    this.logger.debug(
      'RedactionPlugin',
      'DocumentOpened',
      `Initialized redaction state for document: ${documentId}`,
    );
  }

  protected override onDocumentLoaded(documentId: string): void {
    // Redaction plugin renders its own selection & marquee rects, so suppress selection layer rects.
    // Unified mode: both text selection and marquee
    this.selectionCapability?.enableForMode(
      RedactionMode.Redact,
      {
        enableSelection: true,
        showSelectionRects: false,
        enableMarquee: true,
        showMarqueeRects: false,
      },
      documentId,
    );
    // Legacy marquee-only mode
    this.selectionCapability?.enableForMode(
      RedactionMode.MarqueeRedact,
      {
        enableSelection: false,
        enableMarquee: true,
        showMarqueeRects: false,
      },
      documentId,
    );
    // Legacy selection-only mode
    this.selectionCapability?.enableForMode(
      RedactionMode.RedactSelection,
      {
        enableSelection: true,
        showSelectionRects: false,
      },
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

    const marqueeEmitter = this.redactionMarquee$.get(documentId);
    marqueeEmitter?.clear();
    this.redactionMarquee$.delete(documentId);

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

      // Unified redact mode
      enableRedact: () => this.enableRedact(),
      toggleRedact: () => this.toggleRedact(),
      isRedactActive: () => this.isRedactActive(),
      endRedact: () => this.endRedact(),

      // Legacy marquee mode
      enableMarqueeRedact: () => this.enableMarqueeRedact(),
      toggleMarqueeRedact: () => this.toggleMarqueeRedact(),
      isMarqueeRedactActive: () => this.isMarqueeRedactActive(),

      // Legacy selection mode
      enableRedactSelection: () => this.enableRedactSelection(),
      toggleRedactSelection: () => this.toggleRedactSelection(),
      isRedactSelectionActive: () => this.isRedactSelectionActive(),

      addPending: (items) => this.addPendingItems(items),
      removePending: (page, id) => this.removePendingItem(page, id),
      clearPending: () => this.clearPendingItems(),
      commitAllPending: () => this.commitAllPending(),
      commitPending: (page, id) => this.commitPendingOne(page, id),

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

      // Unified redact mode
      enableRedact: () => this.enableRedact(documentId),
      toggleRedact: () => this.toggleRedact(documentId),
      isRedactActive: () => this.isRedactActive(documentId),
      endRedact: () => this.endRedact(documentId),

      // Legacy marquee mode
      enableMarqueeRedact: () => this.enableMarqueeRedact(documentId),
      toggleMarqueeRedact: () => this.toggleMarqueeRedact(documentId),
      isMarqueeRedactActive: () => this.isMarqueeRedactActive(documentId),

      // Legacy selection mode
      enableRedactSelection: () => this.enableRedactSelection(documentId),
      toggleRedactSelection: () => this.toggleRedactSelection(documentId),
      isRedactSelectionActive: () => this.isRedactSelectionActive(documentId),

      addPending: (items) => this.addPendingItems(items, documentId),
      removePending: (page, id) => this.removePendingItem(page, id, documentId),
      clearPending: () => this.clearPendingItems(documentId),
      commitAllPending: () => this.commitAllPending(documentId),
      commitPending: (page, id) => this.commitPendingOne(page, id, documentId),

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

  /**
   * Get pending redactions derived from annotation plugin (annotation mode only)
   */
  private getPendingFromAnnotations(documentId: string): Record<number, RedactionItem[]> {
    if (!this.annotationCapability) return {};

    try {
      const annoState = this.annotationCapability.forDocument(documentId).getState();
      const result: Record<number, RedactionItem[]> = {};

      for (const ta of Object.values(annoState.byUid)) {
        if (ta.object.type === PdfAnnotationSubtype.REDACT) {
          const item = this.annotationToRedactionItem(ta.object);
          const page = ta.object.pageIndex;
          (result[page] ??= []).push(item);
        }
      }
      return result;
    } catch {
      // Annotation state not initialized yet
      return {};
    }
  }

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
  // Annotation Mode State Sync
  // ─────────────────────────────────────────────────────────

  /**
   * Sync internal state when REDACT annotation is created.
   * Called from annotation event listener in annotation mode.
   */
  private syncFromAnnotationCreate(documentId: string, annotation: PdfRedactAnnoObject): void {
    const item = this.annotationToRedactionItem(annotation);
    this.dispatch(addPending(documentId, [item]));
  }

  /**
   * Sync internal state when REDACT annotation is updated (moved/resized/color changed).
   * Called from annotation event listener in annotation mode.
   */
  private syncFromAnnotationUpdate(
    documentId: string,
    annotation: PdfRedactAnnoObject,
    patch: Partial<PdfRedactAnnoObject>,
  ): void {
    // Only sync if rect, segmentRects, strokeColor, or color changed
    if (
      !('rect' in patch) &&
      !('segmentRects' in patch) &&
      !('strokeColor' in patch) &&
      !('color' in patch)
    )
      return;

    const updatePatch: {
      rect?: Rect;
      rects?: Rect[];
      markColor?: string;
      redactionColor?: string;
    } = {};
    if (patch.rect) updatePatch.rect = patch.rect;
    if (patch.segmentRects) updatePatch.rects = patch.segmentRects;
    if (patch.strokeColor) updatePatch.markColor = patch.strokeColor;
    if (patch.color) updatePatch.redactionColor = patch.color;

    this.logger.debug('RedactionPlugin', 'AnnotationUpdated', {
      documentId,
      annotation,
      patch: updatePatch,
    });

    this.dispatch(updatePending(documentId, annotation.pageIndex, annotation.id, updatePatch));
  }

  /**
   * Sync internal state when REDACT annotation is deleted.
   * Called from annotation event listener in annotation mode.
   */
  private syncFromAnnotationDelete(documentId: string, annotation: PdfRedactAnnoObject): void {
    this.dispatch(removePending(documentId, annotation.pageIndex, annotation.id));
  }

  /**
   * Sync internal state from existing REDACT annotations after initial load.
   * Called when annotation plugin emits 'loaded' event.
   */
  private syncFromAnnotationLoad(documentId: string): void {
    const pending = this.getPendingFromAnnotations(documentId);

    // Clear and repopulate (in case of reload scenarios)
    this.dispatch(clearPending(documentId));

    for (const [, items] of Object.entries(pending)) {
      if (items.length > 0) {
        this.dispatch(addPending(documentId, items));
      }
    }
  }

  /**
   * Sync selection state from annotation plugin's selected REDACT annotation.
   * Called when annotation plugin state changes.
   */
  private syncSelectionFromAnnotation(documentId: string): void {
    const annoState = this.annotationCapability?.forDocument(documentId).getState();
    if (!annoState) return;

    // Find if a REDACT annotation is selected
    const selectedRedact = annoState.selectedUids
      .map((uid) => annoState.byUid[uid])
      .find((ta) => ta?.object.type === PdfAnnotationSubtype.REDACT);

    if (selectedRedact) {
      const obj = selectedRedact.object as PdfRedactAnnoObject;
      this.dispatch(selectPending(documentId, obj.pageIndex, obj.id));
    } else {
      // Check if currently selected in redaction state - if so, clear it
      const docState = this.getDocumentState(documentId);
      if (docState?.selected) {
        this.dispatch(deselectPending(documentId));
      }
    }
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

    if (this.useAnnotationMode) {
      // ANNOTATION MODE: Create REDACT annotations via annotation plugin
      const annoScope = this.annotationCapability!.forDocument(id);
      for (const item of items) {
        const annotation = this.redactionItemToAnnotation(item);
        annoScope.createAnnotation(item.page, annotation);
      }
      // Select the last one
      if (items.length > 0) {
        const lastItem = items[items.length - 1];
        annoScope.selectAnnotation(lastItem.page, lastItem.id);
      }
    } else {
      // LEGACY MODE: Add to internal pending state
      this.dispatch(addPending(id, items));
    }
    this.events$.emit({ type: 'add', documentId: id, items });
  }

  private removePendingItem(page: number, itemId: string, documentId?: string) {
    const id = documentId ?? this.getActiveDocumentId();

    if (this.useAnnotationMode) {
      // ANNOTATION MODE: Delete annotation via annotation plugin
      this.annotationCapability?.forDocument(id).deleteAnnotation(page, itemId);
    } else {
      // LEGACY MODE: Remove from internal state
      this.dispatch(removePending(id, page, itemId));
    }
    this.events$.emit({ type: 'remove', documentId: id, page, id: itemId });
  }

  private clearPendingItems(documentId?: string) {
    const id = documentId ?? this.getActiveDocumentId();

    if (this.useAnnotationMode) {
      // ANNOTATION MODE: Delete all REDACT annotations
      const pending = this.getPendingFromAnnotations(id);
      const annoScope = this.annotationCapability?.forDocument(id);
      for (const [pageStr, items] of Object.entries(pending)) {
        const page = Number(pageStr);
        for (const item of items) {
          annoScope?.deleteAnnotation(page, item.id);
        }
      }
    } else {
      // LEGACY MODE: Clear internal state
      this.dispatch(clearPending(id));
    }
    this.events$.emit({ type: 'clear', documentId: id });
  }

  private selectPending(page: number, itemId: string, documentId?: string) {
    const id = documentId ?? this.getActiveDocumentId();

    if (this.useAnnotationMode) {
      // ANNOTATION MODE: Select annotation via annotation plugin
      // (annotation plugin handles 'annotation-selection' page activity)
      this.annotationCapability?.forDocument(id).selectAnnotation(page, itemId);
    } else {
      // LEGACY MODE: Update internal selection state
      this.dispatch(selectPending(id, page, itemId));
      // Claim page activity so the scroll plugin can elevate this page
      this.interactionManagerCapability?.claimPageActivity(id, 'redaction-selection', page);
    }
    this.selectionCapability?.forDocument(id).clear();
  }

  private getSelectedPending(documentId?: string): SelectedRedaction | null {
    const id = documentId ?? this.getActiveDocumentId();
    return this.getDocumentState(id)?.selected ?? null;
  }

  private deselectPending(documentId?: string) {
    const id = documentId ?? this.getActiveDocumentId();

    if (this.useAnnotationMode) {
      // ANNOTATION MODE: Deselect via annotation plugin
      // (annotation plugin handles 'annotation-selection' page activity)
      this.annotationCapability?.forDocument(id).deselectAnnotation();
    } else {
      // LEGACY MODE: Update internal selection state
      this.dispatch(deselectPending(id));
      // Release page activity claim
      this.interactionManagerCapability?.releasePageActivity(id, 'redaction-selection');
    }
  }

  // ─────────────────────────────────────────────────────────
  // Legacy Selection Mode (text-based redactions)
  // ─────────────────────────────────────────────────────────

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

    // Always activate RedactSelection mode (works in both annotation and legacy modes)
    this.interactionManagerCapability?.forDocument(id).activate(RedactionMode.RedactSelection);
  }

  private toggleRedactSelection(documentId?: string) {
    const id = documentId ?? this.getActiveDocumentId();
    const scope = this.interactionManagerCapability?.forDocument(id);
    const activeMode = scope?.getActiveMode();

    if (activeMode === RedactionMode.RedactSelection) {
      scope?.activateDefaultMode();
    } else {
      // Prevent enabling without permission
      if (!this.checkPermission(id, PdfPermissionFlag.ModifyContents)) {
        return;
      }
      scope?.activate(RedactionMode.RedactSelection);
    }
  }

  private isRedactSelectionActive(documentId?: string): boolean {
    const id = documentId ?? this.getActiveDocumentId();
    const activeMode = this.interactionManagerCapability?.forDocument(id).getActiveMode();
    // Selection is available in both Redact and RedactSelection modes
    return activeMode === RedactionMode.Redact || activeMode === RedactionMode.RedactSelection;
  }

  // ─────────────────────────────────────────────────────────
  // Legacy Marquee Mode (area-based redactions)
  // ─────────────────────────────────────────────────────────

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

    // Always activate MarqueeRedact mode (works in both annotation and legacy modes)
    this.interactionManagerCapability?.forDocument(id).activate(RedactionMode.MarqueeRedact);
  }

  private toggleMarqueeRedact(documentId?: string) {
    const id = documentId ?? this.getActiveDocumentId();
    const scope = this.interactionManagerCapability?.forDocument(id);
    const activeMode = scope?.getActiveMode();

    if (activeMode === RedactionMode.MarqueeRedact) {
      scope?.activateDefaultMode();
    } else {
      // Prevent enabling without permission
      if (!this.checkPermission(id, PdfPermissionFlag.ModifyContents)) {
        return;
      }
      scope?.activate(RedactionMode.MarqueeRedact);
    }
  }

  private isMarqueeRedactActive(documentId?: string): boolean {
    const id = documentId ?? this.getActiveDocumentId();
    const activeMode = this.interactionManagerCapability?.forDocument(id).getActiveMode();
    // Marquee is available in both Redact and MarqueeRedact modes
    return activeMode === RedactionMode.Redact || activeMode === RedactionMode.MarqueeRedact;
  }

  // ─────────────────────────────────────────────────────────
  // Unified Redact Mode (recommended)
  // ─────────────────────────────────────────────────────────

  private enableRedact(documentId?: string) {
    const id = documentId ?? this.getActiveDocumentId();

    // Prevent enabling redact mode without permission
    if (!this.checkPermission(id, PdfPermissionFlag.ModifyContents)) {
      this.logger.debug(
        'RedactionPlugin',
        'EnableRedact',
        `Cannot enable redact mode: document ${id} lacks ModifyContents permission`,
      );
      return;
    }

    this.interactionManagerCapability?.forDocument(id).activate(RedactionMode.Redact);
  }

  private toggleRedact(documentId?: string) {
    const id = documentId ?? this.getActiveDocumentId();
    const scope = this.interactionManagerCapability?.forDocument(id);
    const activeMode = scope?.getActiveMode();

    if (activeMode === RedactionMode.Redact) {
      scope?.activateDefaultMode();
    } else {
      // Prevent enabling redact mode without permission
      if (!this.checkPermission(id, PdfPermissionFlag.ModifyContents)) {
        return;
      }
      scope?.activate(RedactionMode.Redact);
    }
  }

  private isRedactActive(documentId?: string): boolean {
    const id = documentId ?? this.getActiveDocumentId();
    const activeMode = this.interactionManagerCapability?.forDocument(id).getActiveMode();
    return activeMode === RedactionMode.Redact;
  }

  private endRedact(documentId?: string) {
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

  public onRedactionMarqueeChange(
    documentId: string,
    callback: (data: { pageIndex: number; rect: Rect | null; modeId: string }) => void,
  ) {
    const emitter = this.redactionMarquee$.get(documentId);
    return emitter?.on(callback) ?? (() => {});
  }

  /**
   * Get the stroke color for redaction previews.
   * In annotation mode: returns tool's defaults.strokeColor
   * In legacy mode: returns hardcoded red
   */
  public getPreviewStrokeColor(): string {
    if (this.useAnnotationMode && this.annotationCapability) {
      const tool = this.annotationCapability.getTool<AnnotationTool<PdfRedactAnnoObject>>('redact');
      return tool?.defaults.strokeColor ?? '#FF0000';
    }
    return '#FF0000';
  }

  private queueCurrentSelectionAsPending(documentId?: string): Task<boolean, PdfErrorReason> {
    const id = documentId ?? this.getActiveDocumentId();

    if (!this.selectionCapability) {
      return PdfTaskHelper.reject({
        code: PdfErrorCode.NotFound,
        message: '[RedactionPlugin] selection plugin required',
      });
    }

    const coreDoc = this.coreState.core.documents[id];
    if (!coreDoc?.document) {
      return PdfTaskHelper.reject({ code: PdfErrorCode.NotFound, message: 'Document not found' });
    }

    const selectionScope = this.selectionCapability.forDocument(id);
    const formatted = selectionScope.getFormattedSelection();
    if (!formatted.length) return PdfTaskHelper.resolve(true);

    // Fetch selected text BEFORE clearing (async, but started now while selection exists)
    const textTask = selectionScope.getSelectedText();

    // Clear live UI selection
    const emitter = this.redactionSelection$.get(id);
    emitter?.emit([]);
    selectionScope.clear();

    // Enable redact selection mode for legacy mode
    if (!this.useAnnotationMode) {
      this.enableRedactSelection(id);
    }

    // Wait for text, then create redactions with text included
    const task = new Task<boolean, PdfErrorReason>();
    textTask.wait(
      (textArr) => {
        const text = textArr.join(' ');
        this.createRedactionsFromSelection(id, formatted, text);
        task.resolve(true);
      },
      () => {
        // On error, still create redactions but without text
        this.createRedactionsFromSelection(id, formatted);
        task.resolve(true);
      },
    );

    return task;
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

    const pdfPage = coreDoc.document.pages[page];
    if (!pdfPage)
      return PdfTaskHelper.reject({ code: PdfErrorCode.NotFound, message: 'Page not found' });

    if (this.useAnnotationMode) {
      // ANNOTATION MODE: Use applyRedaction engine method
      // In annotation mode, pending redactions are stored as REDACT annotations,
      // not in docState.pending, so we go directly to apply
      this.logger.debug(
        'RedactionPlugin',
        'CommitPendingOne',
        `Applying redaction in annotation mode: page ${page}, id ${id}`,
      );
      return this.applyRedactionAnnotationMode(docId, coreDoc.document, pdfPage, id);
    }

    // LEGACY MODE: Use internal pending state
    const docState = this.getDocumentState(docId);
    if (!docState) {
      return PdfTaskHelper.reject({
        code: PdfErrorCode.NotFound,
        message: 'Document state not found',
      });
    }

    const item = (docState.pending[page] ?? []).find((it) => it.id === id);
    if (!item) {
      this.logger.debug(
        'RedactionPlugin',
        'CommitPendingOne',
        `No pending item found for page ${page}, id ${id}`,
      );
      return PdfTaskHelper.resolve(true);
    }

    return this.commitPendingOneLegacy(docId, coreDoc.document, pdfPage, page, item);
  }

  /**
   * Legacy commit single redaction using redactTextInRects
   */
  private commitPendingOneLegacy(
    docId: string,
    doc: PdfDocumentObject,
    pdfPage: PdfPageObject,
    page: number,
    item: RedactionItem,
  ): Task<boolean, PdfErrorReason> {
    const rects: Rect[] = item.kind === 'text' ? item.rects : [item.rect];

    const task = new Task<boolean, PdfErrorReason>();
    this.engine
      .redactTextInRects(doc, pdfPage, rects, {
        drawBlackBoxes: this.config.drawBlackBoxes,
      })
      .wait(
        () => {
          this.dispatch(removePending(docId, page, item.id));
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

  /**
   * Annotation mode: Apply single redaction using engine.applyRedaction
   */
  private applyRedactionAnnotationMode(
    docId: string,
    doc: PdfDocumentObject,
    pdfPage: PdfPageObject,
    annotationId: string,
  ): Task<boolean, PdfErrorReason> {
    const task = new Task<boolean, PdfErrorReason>();

    // Get the annotation from annotation plugin
    const anno = this.annotationCapability?.forDocument(docId).getAnnotationById(annotationId);
    this.logger.debug(
      'RedactionPlugin',
      'ApplyRedactionAnnotationMode',
      `Looking for annotation ${annotationId}, found: ${!!anno}, type: ${anno?.object.type}`,
    );

    if (!anno || anno.object.type !== PdfAnnotationSubtype.REDACT) {
      this.logger.warn(
        'RedactionPlugin',
        'ApplyRedactionAnnotationMode',
        `Redaction annotation not found or wrong type: ${annotationId}`,
      );
      return PdfTaskHelper.reject({
        code: PdfErrorCode.NotFound,
        message: 'Redaction annotation not found',
      });
    }

    this.logger.debug(
      'RedactionPlugin',
      'ApplyRedactionAnnotationMode',
      `Calling engine.applyRedaction for annotation ${annotationId} on page ${pdfPage.index}`,
    );

    this.engine.applyRedaction(doc, pdfPage, anno.object).wait(
      () => {
        this.logger.debug(
          'RedactionPlugin',
          'ApplyRedactionAnnotationMode',
          `Successfully applied redaction ${annotationId} on page ${pdfPage.index}`,
        );
        // Purge the annotation from state (engine already removed it from PDF)
        this.annotationCapability?.forDocument(docId).purgeAnnotation(pdfPage.index, annotationId);

        // Remove from internal pending state (purgeAnnotation doesn't emit events)
        this.dispatch(removePending(docId, pdfPage.index, annotationId));

        // Purge history entries for this committed redaction (permanent, irreversible operation)
        this.historyCapability
          ?.forDocument(docId)
          .purgeByMetadata<AnnotationCommandMetadata>(
            (meta) => meta?.annotationIds?.includes(annotationId) ?? false,
            'annotations',
          );

        this.dispatchCoreAction(refreshPages(docId, [pdfPage.index]));
        this.events$.emit({ type: 'commit', documentId: docId, success: true });
        task.resolve(true);
      },
      (error) => {
        this.logger.error(
          'RedactionPlugin',
          'ApplyRedactionAnnotationMode',
          `Failed to apply redaction ${annotationId}: ${error.reason?.message ?? 'Unknown error'}`,
        );
        this.events$.emit({
          type: 'commit',
          documentId: docId,
          success: false,
          error: error.reason,
        });
        task.reject({ code: PdfErrorCode.Unknown, message: 'Failed to apply redaction' });
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

    if (this.useAnnotationMode) {
      // ANNOTATION MODE: Use applyAllRedactions per page
      return this.applyAllRedactionsAnnotationMode(docId, coreDoc.document);
    } else {
      // LEGACY MODE: Use redactTextInRects
      return this.commitAllPendingLegacy(docId, coreDoc.document, docState);
    }
  }

  /**
   * Legacy commit all redactions using redactTextInRects
   */
  private commitAllPendingLegacy(
    docId: string,
    doc: PdfDocumentObject,
    docState: RedactionDocumentState,
  ): Task<boolean, PdfErrorReason> {
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
      const page = doc.pages[pageIndex];
      if (!page) continue;
      if (!rects.length) continue;
      tasks.push(
        this.engine.redactTextInRects(doc, page, rects, {
          drawBlackBoxes: this.config.drawBlackBoxes,
        }),
      );
    }

    const task = new Task<boolean, PdfErrorReason>();
    Task.all(tasks).wait(
      () => {
        this.dispatch(clearPending(docId));
        this.dispatchCoreAction(refreshPages(docId, pagesToRefresh));
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

  /**
   * Annotation mode: Apply all redactions using engine.applyAllRedactions per page
   */
  private applyAllRedactionsAnnotationMode(
    docId: string,
    doc: PdfDocumentObject,
  ): Task<boolean, PdfErrorReason> {
    // Collect all REDACT annotation IDs per page (for purging after apply)
    const annoState = this.annotationCapability!.forDocument(docId).getState();
    const redactAnnotationsByPage = new Map<number, string[]>();

    for (const ta of Object.values(annoState.byUid)) {
      if (ta.object.type === PdfAnnotationSubtype.REDACT) {
        const pageIds = redactAnnotationsByPage.get(ta.object.pageIndex) ?? [];
        pageIds.push(ta.object.id);
        redactAnnotationsByPage.set(ta.object.pageIndex, pageIds);
      }
    }

    const pagesToProcess = Array.from(redactAnnotationsByPage.keys());

    if (pagesToProcess.length === 0) {
      return PdfTaskHelper.resolve(true);
    }

    const tasks: PdfTask<boolean>[] = [];
    for (const pageIndex of pagesToProcess) {
      const page = doc.pages[pageIndex];
      if (!page) continue;
      tasks.push(this.engine.applyAllRedactions(doc, page));
    }

    const task = new Task<boolean, PdfErrorReason>();
    Task.all(tasks).wait(
      () => {
        // Purge all REDACT annotations from state (engine already removed them from PDF)
        const annoScope = this.annotationCapability?.forDocument(docId);
        const allPurgedIds: string[] = [];

        for (const [pageIndex, ids] of redactAnnotationsByPage) {
          for (const id of ids) {
            annoScope?.purgeAnnotation(pageIndex, id);
            // Remove from internal pending state (purgeAnnotation doesn't emit events)
            this.dispatch(removePending(docId, pageIndex, id));
            allPurgedIds.push(id);
          }
        }

        // Purge history entries for all committed redactions (permanent, irreversible operations)
        if (allPurgedIds.length > 0) {
          this.historyCapability
            ?.forDocument(docId)
            .purgeByMetadata<AnnotationCommandMetadata>(
              (meta) => meta?.annotationIds?.some((id) => allPurgedIds.includes(id)) ?? false,
              'annotations',
            );
        }

        this.dispatchCoreAction(refreshPages(docId, pagesToProcess));
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
        task.reject({ code: PdfErrorCode.Unknown, message: 'Failed to apply redactions' });
      },
    );

    return task;
  }

  // ─────────────────────────────────────────────────────────
  // Annotation Mode Helpers
  // ─────────────────────────────────────────────────────────

  /**
   * Create REDACT annotations from text selection (annotation mode only)
   * @returns Array of annotation IDs that were created
   */
  private createRedactAnnotationsFromSelection(
    documentId: string,
    formattedSelection: FormattedSelection[],
    text?: string,
  ): string[] {
    if (!this.annotationCapability) return [];

    const annoScope = this.annotationCapability.forDocument(documentId);
    const tool = this.annotationCapability.getTool<AnnotationTool<PdfRedactAnnoObject>>('redact');
    const defaults = tool?.defaults;
    const annotationIds: string[] = [];

    for (const selection of formattedSelection) {
      const annotationId = uuidV4();
      annotationIds.push(annotationId);

      const annotation: PdfRedactAnnoObject = {
        ...defaults,
        id: annotationId,
        type: PdfAnnotationSubtype.REDACT,
        pageIndex: selection.pageIndex,
        rect: selection.rect,
        segmentRects: selection.segmentRects,
        ...(text ? { custom: { text } } : {}),
        created: new Date(),
      };

      annoScope.createAnnotation(selection.pageIndex, annotation);

      // Select the last created annotation
      if (selection === formattedSelection[formattedSelection.length - 1]) {
        annoScope.selectAnnotation(selection.pageIndex, annotationId);
      }
    }

    // Update pending items with text if provided
    // (syncFromAnnotationCreate adds the items to pending state)
    if (text) {
      for (let i = 0; i < annotationIds.length; i++) {
        const pageIndex = formattedSelection[i].pageIndex;
        this.dispatch(updatePending(documentId, pageIndex, annotationIds[i], { text }));
      }
    }

    return annotationIds;
  }

  /**
   * Create legacy RedactionItems from text selection (legacy mode only)
   */
  private createLegacyRedactionsFromSelection(
    documentId: string,
    formattedSelection: FormattedSelection[],
    text?: string,
  ): void {
    const redactionColor = this.config.drawBlackBoxes ? '#000000' : 'transparent';
    const items: RedactionItem[] = formattedSelection.map((s) => ({
      id: uuidV4(),
      kind: 'text' as const,
      page: s.pageIndex,
      rect: s.rect,
      rects: s.segmentRects,
      source: 'legacy' as const,
      markColor: '#FF0000',
      redactionColor,
      text,
    }));

    this.dispatch(addPending(documentId, items));

    if (items.length) {
      this.selectPending(items[items.length - 1].page, items[items.length - 1].id, documentId);
    }
  }

  /**
   * Unified method to create redactions from text selection.
   * Delegates to annotation mode or legacy mode helper based on configuration.
   */
  private createRedactionsFromSelection(
    documentId: string,
    formattedSelection: FormattedSelection[],
    text?: string,
  ): void {
    if (this.useAnnotationMode) {
      this.createRedactAnnotationsFromSelection(documentId, formattedSelection, text);
    } else {
      this.createLegacyRedactionsFromSelection(documentId, formattedSelection, text);
    }
  }

  /**
   * Create a REDACT annotation from an area/marquee selection (annotation mode only)
   */
  private createRedactAnnotationFromArea(documentId: string, pageIndex: number, rect: Rect): void {
    if (!this.annotationCapability) return;

    const annoScope = this.annotationCapability.forDocument(documentId);
    const tool = this.annotationCapability.getTool<AnnotationTool<PdfRedactAnnoObject>>('redact');
    const defaults = tool?.defaults;
    const annotationId = uuidV4();

    const annotation: PdfRedactAnnoObject = {
      ...defaults,
      id: annotationId,
      type: PdfAnnotationSubtype.REDACT,
      pageIndex,
      rect,
      segmentRects: [], // No segment rects for area redaction
      created: new Date(),
    };

    annoScope.createAnnotation(pageIndex, annotation);
    annoScope.selectAnnotation(pageIndex, annotationId);
  }

  /**
   * Convert a RedactionItem to a PdfRedactAnnoObject
   */
  private redactionItemToAnnotation(item: RedactionItem): PdfRedactAnnoObject {
    const tool = this.annotationCapability?.getTool('redact');
    const defaults = tool?.defaults ?? {};

    return {
      ...defaults,
      id: item.id,
      type: PdfAnnotationSubtype.REDACT,
      pageIndex: item.page,
      rect: item.rect,
      segmentRects: item.kind === 'text' ? item.rects : [],
      created: new Date(),
    };
  }

  /**
   * Convert a PdfRedactAnnoObject to a RedactionItem
   */
  private annotationToRedactionItem(anno: PdfRedactAnnoObject): RedactionItem {
    const markColor = anno.strokeColor ?? '#FF0000';
    const redactionColor = anno.color ?? 'transparent';

    if (anno.segmentRects && anno.segmentRects.length > 0) {
      return {
        id: anno.id,
        kind: 'text',
        page: anno.pageIndex,
        rect: anno.rect,
        rects: anno.segmentRects,
        source: 'annotation',
        markColor,
        redactionColor,
        ...(anno.custom?.text ? { text: anno.custom.text } : {}),
      };
    } else {
      return {
        id: anno.id,
        kind: 'area',
        page: anno.pageIndex,
        rect: anno.rect,
        source: 'annotation',
        markColor,
        redactionColor,
      };
    }
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
    this.redactionMarquee$.forEach((emitter) => emitter.clear());
    this.redactionMarquee$.clear();

    // Cleanup all unsubscribers
    this.documentUnsubscribers.forEach((unsubscribers) => {
      unsubscribers.forEach((unsub) => unsub());
    });
    this.documentUnsubscribers.clear();

    await super.destroy();
  }
}
