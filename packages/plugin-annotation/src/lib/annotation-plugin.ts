import { BasePlugin, createBehaviorEmitter, PluginRegistry, Listener } from '@embedpdf/core';
import {
  ignore,
  PdfAnnotationObject,
  PdfDocumentObject,
  PdfErrorReason,
  Task,
  TaskStage,
  PdfTaskHelper,
  PdfErrorCode,
  AnnotationCreateContext,
  uuidV4,
  PdfAnnotationSubtype,
  PdfPermissionFlag,
  Position,
  Rect,
  PdfAnnotationReplyType,
} from '@embedpdf/models';
import {
  AnnotationCapability,
  AnnotationCommandMetadata,
  AnnotationEvent,
  AnnotationPluginConfig,
  AnnotationState,
  AnnotationDocumentState,
  AnnotationScope,
  AnnotationStateChangeEvent,
  AnnotationActiveToolChangeEvent,
  AnnotationToolsChangeEvent,
  CommitBatch,
  GetPageAnnotationsOptions,
  ImportAnnotationItem,
  RenderAnnotationOptions,
  TrackedAnnotation,
  TransformOptions,
  AnnotationConstraintInfo,
  CombinedConstraints,
  GroupingAction,
  UnifiedDragOptions,
  UnifiedDragState,
  UnifiedDragEvent,
  UnifiedResizeOptions,
  UnifiedResizeState,
  UnifiedResizeEvent,
  UnifiedResizeAnnotationInfo,
} from './types';
import {
  setAnnotations,
  selectAnnotation,
  deselectAnnotation,
  addToSelection,
  removeFromSelection,
  setSelection,
  AnnotationAction,
  addColorPreset,
  createAnnotation,
  patchAnnotation,
  deleteAnnotation,
  commitPendingChanges,
  purgeAnnotation,
  setToolDefaults,
  setActiveToolId,
  addTool,
  initAnnotationState,
  cleanupAnnotationState,
} from './actions';
import {
  InteractionManagerCapability,
  InteractionManagerPlugin,
} from '@embedpdf/plugin-interaction-manager';
import { SelectionPlugin, SelectionCapability } from '@embedpdf/plugin-selection';
import { HistoryPlugin, HistoryCapability, Command } from '@embedpdf/plugin-history';
import {
  getAnnotationByUid,
  getSelectedAnnotation,
  getSelectedAnnotations,
  getSelectedAnnotationIds,
  getIRTChildIds,
  getAttachedLinks,
  getGroupMembers,
  isInGroup,
  getSelectionGroupingAction,
} from './selectors';
import { initialDocumentState } from './reducer';
import { AnnotationTool } from './tools/types';
import { AnyPreviewState, HandlerContext, HandlerFactory, HandlerServices } from './handlers/types';
import {
  circleHandlerFactory,
  squareHandlerFactory,
  stampHandlerFactory,
  polygonHandlerFactory,
  polylineHandlerFactory,
  lineHandlerFactory,
  inkHandlerFactory,
  freeTextHandlerFactory,
} from './handlers';
import { rectsIntersect, isLink } from './helpers';
import { PatchRegistry, TransformContext } from './patching/patch-registry';
import { patchInk, patchLine, patchPolyline, patchPolygon } from './patching/patches';

export class AnnotationPlugin extends BasePlugin<
  AnnotationPluginConfig,
  AnnotationCapability,
  AnnotationState,
  AnnotationAction
> {
  static readonly id = 'annotation' as const;
  private readonly ANNOTATION_HISTORY_TOPIC = 'annotations';

  public readonly config: AnnotationPluginConfig;
  private readonly state$ = createBehaviorEmitter<AnnotationStateChangeEvent>();
  private readonly interactionManager: InteractionManagerCapability | null;
  private readonly selection: SelectionCapability | null;
  private readonly history: HistoryCapability | null;

  // Per-document state
  private pendingContexts = new Map<string, Map<string, unknown>>();
  private isInitialLoadComplete = new Map<string, boolean>();
  private importQueue = new Map<string, ImportAnnotationItem<PdfAnnotationObject>[]>();
  private commitInProgress = new Map<string, boolean>(); // Guard against concurrent commits

  private handlerFactories = new Map<PdfAnnotationSubtype, HandlerFactory<any>>();
  private readonly activeTool$ = createBehaviorEmitter<AnnotationActiveToolChangeEvent>();
  private readonly events$ = createBehaviorEmitter<AnnotationEvent>();
  private readonly toolsChange$ = createBehaviorEmitter<AnnotationToolsChangeEvent>();
  private readonly patchRegistry = new PatchRegistry();

  // Unified drag coordination (per-document)
  private readonly unifiedDragStates = new Map<string, UnifiedDragState>();
  private readonly unifiedDrag$ = createBehaviorEmitter<UnifiedDragEvent>();

  // Unified resize coordination (per-document) - NEW: Plugin owns all logic
  private readonly unifiedResizeStates = new Map<string, UnifiedResizeState>();
  private readonly unifiedResize$ = createBehaviorEmitter<UnifiedResizeEvent>();

  constructor(id: string, registry: PluginRegistry, config: AnnotationPluginConfig) {
    super(id, registry);
    this.config = config;

    this.selection = registry.getPlugin<SelectionPlugin>('selection')?.provides() ?? null;
    this.history = registry.getPlugin<HistoryPlugin>('history')?.provides() ?? null;
    this.interactionManager =
      registry.getPlugin<InteractionManagerPlugin>('interaction-manager')?.provides() ?? null;

    this.registerHandlerFactories();
    this.registerBuiltInPatches();
  }

  // ─────────────────────────────────────────────────────────
  // Document Lifecycle (from BasePlugin)
  // ─────────────────────────────────────────────────────────

  protected override onDocumentLoadingStarted(documentId: string): void {
    // Initialize annotation state for this document
    this.dispatch(initAnnotationState(documentId, initialDocumentState()));

    // Initialize per-document tracking
    this.pendingContexts.set(documentId, new Map());
    this.isInitialLoadComplete.set(documentId, false);
    this.importQueue.set(documentId, []);

    this.logger.debug(
      'AnnotationPlugin',
      'DocumentOpened',
      `Initialized annotation state for document: ${documentId}`,
    );
  }

  protected override onDocumentLoaded(documentId: string): void {
    // Load all annotations for this document
    const docState = this.getCoreDocument(documentId);
    if (docState?.document) {
      this.getAllAnnotations(documentId, docState.document);
    }

    if (this.selection) {
      for (const tool of this.state.tools) {
        if (tool.interaction.textSelection) {
          // Text markup tools render their own highlight preview, so suppress selection layer rects
          this.selection.enableForMode(tool.interaction.mode ?? tool.id, {
            showSelectionRects: false,
            enableSelection: true,
            enableMarquee: false,
          });
        }
      }
    }
  }

  protected override onDocumentClosed(documentId: string): void {
    // Cleanup annotation state
    this.dispatch(cleanupAnnotationState(documentId));

    // Cleanup per-document tracking
    this.pendingContexts.delete(documentId);
    this.isInitialLoadComplete.delete(documentId);
    this.importQueue.delete(documentId);

    this.logger.debug(
      'AnnotationPlugin',
      'DocumentClosed',
      `Cleaned up annotation state for document: ${documentId}`,
    );
  }

  private registerHandlerFactories() {
    this.handlerFactories.set(PdfAnnotationSubtype.CIRCLE, circleHandlerFactory);
    this.handlerFactories.set(PdfAnnotationSubtype.SQUARE, squareHandlerFactory);
    this.handlerFactories.set(PdfAnnotationSubtype.STAMP, stampHandlerFactory);
    this.handlerFactories.set(PdfAnnotationSubtype.POLYGON, polygonHandlerFactory);
    this.handlerFactories.set(PdfAnnotationSubtype.POLYLINE, polylineHandlerFactory);
    this.handlerFactories.set(PdfAnnotationSubtype.LINE, lineHandlerFactory);
    this.handlerFactories.set(PdfAnnotationSubtype.INK, inkHandlerFactory);
    this.handlerFactories.set(PdfAnnotationSubtype.FREETEXT, freeTextHandlerFactory);
  }

  private registerBuiltInPatches() {
    this.patchRegistry.register(PdfAnnotationSubtype.INK, patchInk);
    this.patchRegistry.register(PdfAnnotationSubtype.LINE, patchLine);
    this.patchRegistry.register(PdfAnnotationSubtype.POLYLINE, patchPolyline);
    this.patchRegistry.register(PdfAnnotationSubtype.POLYGON, patchPolygon);
  }

  async initialize(): Promise<void> {
    // Register interaction modes for all tools defined in the initial state
    this.state.tools.forEach((tool) => this.registerInteractionForTool(tool));

    // Listen to history changes for each document
    if (this.history) {
      this.history.onHistoryChange((event) => {
        if (event.topic === this.ANNOTATION_HISTORY_TOPIC && this.config.autoCommit !== false) {
          this.commit(event.documentId);
        }
      });
    }

    this.interactionManager?.onModeChange((s) => {
      const newToolId =
        this.state.tools.find((t) => (t.interaction.mode ?? t.id) === s.activeMode)?.id ?? null;
      const currentToolId = this.state.documents[s.documentId]?.activeToolId ?? null;
      if (newToolId !== currentToolId && s.documentId) {
        this.dispatch(setActiveToolId(s.documentId, newToolId));
      }
    });

    // Subscribe to marquee selection end events from the selection plugin
    // When a marquee selection completes, find and select intersecting annotations
    this.selection?.onMarqueeEnd(({ documentId, pageIndex, rect, modeId }) => {
      // Only select annotations during pointer mode marquee, not during redaction etc.
      if (modeId !== 'pointerMode') return;

      const docState = this.state.documents[documentId];
      if (!docState) return;

      // Get annotations on this page (excluding LINK annotations)
      const pageAnnotations = (docState.pages[pageIndex] ?? [])
        .map((uid) => docState.byUid[uid])
        .filter((ta): ta is TrackedAnnotation => ta !== undefined)
        .filter((ta) => !isLink(ta));

      // Find annotations that intersect with the marquee rect
      const selectedIds = pageAnnotations
        .filter((ta) => rectsIntersect(rect, ta.object.rect))
        .map((ta) => ta.object.id);

      // Expand selection to include full groups
      if (selectedIds.length > 0) {
        const expandedIds = new Set<string>();
        for (const id of selectedIds) {
          if (this.isInGroupMethod(id, documentId)) {
            const members = this.getGroupMembersMethod(id, documentId);
            for (const member of members) {
              expandedIds.add(member.object.id);
            }
          } else {
            expandedIds.add(id);
          }
        }

        this.setSelectionMethod([...expandedIds], documentId);
      }
    });

    this.selection?.onEndSelection(({ documentId }) => {
      // Prevent creating annotations from text selection if no permission
      if (!this.checkPermission(documentId, PdfPermissionFlag.ModifyAnnotations)) {
        return;
      }

      const activeTool = this.getActiveTool(documentId);
      if (!activeTool || !activeTool.interaction.textSelection) return;

      const formattedSelection = this.selection?.getFormattedSelection();
      const selectionText = this.selection?.getSelectedText();

      if (!formattedSelection || !selectionText) return;

      for (const selection of formattedSelection) {
        selectionText.wait((text) => {
          const annotationId = uuidV4();
          // Create an annotation using the defaults from the active text tool
          this.createAnnotation(
            selection.pageIndex,
            {
              ...activeTool.defaults,
              rect: selection.rect,
              segmentRects: selection.segmentRects,
              pageIndex: selection.pageIndex,
              created: new Date(),
              id: annotationId,
              custom: {
                text: text.join('\n'),
              },
            } as PdfAnnotationObject,
            undefined,
            documentId,
          );

          if (this.getToolBehavior(activeTool, 'deactivateToolAfterCreate')) {
            this.setActiveTool(null, documentId);
          }
          if (this.getToolBehavior(activeTool, 'selectAfterCreate')) {
            this.selectAnnotation(selection.pageIndex, annotationId, documentId);
          }
        }, ignore);
      }

      this.selection?.clear();
    });
  }

  private registerInteractionForTool(tool: AnnotationTool) {
    this.interactionManager?.registerMode({
      id: tool.interaction.mode ?? tool.id,
      scope: 'page',
      exclusive: tool.interaction.exclusive,
      cursor: tool.interaction.cursor,
    });
  }

  protected buildCapability(): AnnotationCapability {
    return {
      // Active document operations
      getActiveTool: () => this.getActiveTool(),
      setActiveTool: (toolId) => this.setActiveTool(toolId),
      getState: () => this.getDocumentState(),
      getPageAnnotations: (options) => this.getPageAnnotations(options),
      getSelectedAnnotation: () => this.getSelectedAnnotation(),
      getSelectedAnnotations: () => this.getSelectedAnnotationsMethod(),
      getSelectedAnnotationIds: () => this.getSelectedAnnotationIdsMethod(),
      getAnnotationById: (id) => this.getAnnotationById(id),
      selectAnnotation: (pageIndex, id) => this.selectAnnotation(pageIndex, id),
      toggleSelection: (pageIndex, id) => this.toggleSelectionMethod(pageIndex, id),
      addToSelection: (pageIndex, id) => this.addToSelectionMethod(pageIndex, id),
      removeFromSelection: (id) => this.removeFromSelectionMethod(id),
      setSelection: (ids) => this.setSelectionMethod(ids),
      deselectAnnotation: () => this.deselectAnnotation(),
      importAnnotations: (items) => this.importAnnotations(items),
      createAnnotation: (pageIndex, anno, ctx) => this.createAnnotation(pageIndex, anno, ctx),
      updateAnnotation: (pageIndex, id, patch) => this.updateAnnotation(pageIndex, id, patch),
      updateAnnotations: (patches) => this.updateAnnotationsMethod(patches),
      deleteAnnotation: (pageIndex, id) => this.deleteAnnotation(pageIndex, id),
      deleteAnnotations: (annotations, documentId) =>
        this.deleteAnnotationsMethod(annotations, documentId),
      purgeAnnotation: (pageIndex, id, documentId) =>
        this.purgeAnnotationMethod(pageIndex, id, documentId),
      renderAnnotation: (options) => this.renderAnnotation(options),
      commit: () => this.commit(),

      // Attached links (IRT link children)
      getAttachedLinks: (id, documentId) => this.getAttachedLinksMethod(id, documentId),
      hasAttachedLinks: (id, documentId) => this.hasAttachedLinksMethod(id, documentId),
      deleteAttachedLinks: (id, documentId) => this.deleteAttachedLinksMethod(id, documentId),

      // Annotation grouping (RT = Group)
      groupAnnotations: (documentId) => this.groupAnnotationsMethod(documentId),
      ungroupAnnotations: (id, documentId) => this.ungroupAnnotationsMethod(id, documentId),
      getGroupMembers: (id, documentId) => this.getGroupMembersMethod(id, documentId),
      isInGroup: (id, documentId) => this.isInGroupMethod(id, documentId),

      // Document-scoped operations
      forDocument: (documentId) => this.createAnnotationScope(documentId),

      // Global operations
      getTools: () => this.state.tools,
      getTool: (toolId) => this.getTool(toolId),
      addTool: (tool) => {
        this.dispatch(addTool(tool));
        this.registerInteractionForTool(tool);
      },
      findToolForAnnotation: (anno) => this.findToolForAnnotation(anno),
      setToolDefaults: (toolId, patch) => this.dispatch(setToolDefaults(toolId, patch)),
      getColorPresets: () => [...this.state.colorPresets],
      addColorPreset: (color) => this.dispatch(addColorPreset(color)),
      transformAnnotation: (annotation, options) => this.transformAnnotation(annotation, options),
      registerPatchFunction: (type, patchFn) => this.registerPatchFunction(type, patchFn),

      // Events
      onStateChange: this.state$.on,
      onActiveToolChange: this.activeTool$.on,
      onAnnotationEvent: this.events$.on,
      onToolsChange: this.toolsChange$.on,
    };
  }

  // ─────────────────────────────────────────────────────────
  // Document Scoping
  // ─────────────────────────────────────────────────────────

  private createAnnotationScope(documentId: string): AnnotationScope {
    return {
      getState: () => this.getDocumentState(documentId),
      getPageAnnotations: (options) => this.getPageAnnotations(options, documentId),
      getSelectedAnnotation: () => this.getSelectedAnnotation(documentId),
      getSelectedAnnotations: () => this.getSelectedAnnotationsMethod(documentId),
      getSelectedAnnotationIds: () => this.getSelectedAnnotationIdsMethod(documentId),
      getAnnotationById: (id) => this.getAnnotationById(id, documentId),
      selectAnnotation: (pageIndex, id) => this.selectAnnotation(pageIndex, id, documentId),
      toggleSelection: (pageIndex, id) => this.toggleSelectionMethod(pageIndex, id, documentId),
      addToSelection: (pageIndex, id) => this.addToSelectionMethod(pageIndex, id, documentId),
      removeFromSelection: (id) => this.removeFromSelectionMethod(id, documentId),
      setSelection: (ids) => this.setSelectionMethod(ids, documentId),
      deselectAnnotation: () => this.deselectAnnotation(documentId),
      getActiveTool: () => this.getActiveTool(documentId),
      setActiveTool: (toolId) => this.setActiveTool(toolId, documentId),
      findToolForAnnotation: (anno) => this.findToolForAnnotation(anno),
      importAnnotations: (items) => this.importAnnotations(items, documentId),
      createAnnotation: (pageIndex, anno, ctx) =>
        this.createAnnotation(pageIndex, anno, ctx, documentId),
      updateAnnotation: (pageIndex, id, patch) =>
        this.updateAnnotation(pageIndex, id, patch, documentId),
      updateAnnotations: (patches) => this.updateAnnotationsMethod(patches, documentId),
      deleteAnnotation: (pageIndex, id) => this.deleteAnnotation(pageIndex, id, documentId),
      deleteAnnotations: (annotations) => this.deleteAnnotationsMethod(annotations, documentId),
      purgeAnnotation: (pageIndex, id) => this.purgeAnnotationMethod(pageIndex, id, documentId),
      renderAnnotation: (options) => this.renderAnnotation(options, documentId),
      commit: () => this.commit(documentId),
      getAttachedLinks: (id) => this.getAttachedLinksMethod(id, documentId),
      hasAttachedLinks: (id) => this.hasAttachedLinksMethod(id, documentId),
      deleteAttachedLinks: (id) => this.deleteAttachedLinksMethod(id, documentId),
      groupAnnotations: () => this.groupAnnotationsMethod(documentId),
      ungroupAnnotations: (id) => this.ungroupAnnotationsMethod(id, documentId),
      getGroupMembers: (id) => this.getGroupMembersMethod(id, documentId),
      isInGroup: (id) => this.isInGroupMethod(id, documentId),
      getGroupingAction: () => this.getGroupingActionMethod(documentId),
      onStateChange: (listener: Listener<AnnotationDocumentState>) =>
        this.state$.on((event) => {
          if (event.documentId === documentId) listener(event.state);
        }),
      onAnnotationEvent: (listener: Listener<AnnotationEvent>) =>
        this.events$.on((event) => {
          if (event.documentId === documentId) listener(event);
        }),
      onActiveToolChange: (listener: Listener<AnnotationTool | null>) =>
        this.activeTool$.on((event) => {
          if (event.documentId === documentId) listener(event.tool);
        }),
    };
  }

  override onStoreUpdated(prev: AnnotationState, next: AnnotationState): void {
    // Emit state change events for each changed document
    for (const documentId in next.documents) {
      const prevDoc = prev.documents[documentId];
      const nextDoc = next.documents[documentId];

      if (prevDoc !== nextDoc) {
        this.state$.emit({
          documentId,
          state: nextDoc,
        });

        // Emit active tool change if it changed for this document
        if (prevDoc && prevDoc.activeToolId !== nextDoc.activeToolId) {
          this.activeTool$.emit({
            documentId,
            tool: this.getActiveTool(documentId),
          });
        }

        // Update page activity when selection changes
        if (prevDoc?.selectedUids !== nextDoc.selectedUids) {
          this.updateAnnotationSelectionActivity(documentId, nextDoc);
        }
      }
    }

    // If the tools array itself changes, emit active tool for all documents and tools change event
    if (prev.tools !== next.tools) {
      for (const documentId in next.documents) {
        this.activeTool$.emit({
          documentId,
          tool: this.getActiveTool(documentId),
        });
      }

      // Emit tools change event for UI components that only care about tool defaults
      this.toolsChange$.emit({
        tools: next.tools,
      });
    }
  }

  private registerPatchFunction<T extends PdfAnnotationObject>(
    type: PdfAnnotationSubtype,
    patchFn: (original: T, context: TransformContext<T>) => Partial<T>,
  ) {
    this.patchRegistry.register(type, patchFn);
  }

  private transformAnnotation<T extends PdfAnnotationObject>(
    annotation: T,
    options: TransformOptions<T>,
  ) {
    const context: TransformContext<T> = {
      type: options.type,
      changes: options.changes,
      metadata: options.metadata,
    };

    return this.patchRegistry.transform(annotation, context);
  }

  public registerPageHandlers(
    documentId: string,
    pageIndex: number,
    scale: number,
    callbacks: {
      services: HandlerServices;
      onPreview: (toolId: string, state: AnyPreviewState | null) => void;
    },
  ) {
    const docState = this.getCoreDocument(documentId);
    const page = docState?.document?.pages[pageIndex];
    if (!page) return () => {};
    if (!this.interactionManager) return () => {};

    const unregisterFns: (() => void)[] = [];

    for (const tool of this.state.tools) {
      if (!tool.defaults.type) continue;
      const factory = this.handlerFactories.get(tool.defaults.type);
      if (!factory) continue;

      const context: HandlerContext<PdfAnnotationObject> = {
        pageIndex,
        pageSize: page.size,
        scale,
        services: callbacks.services, // Pass through services
        onPreview: (state) => callbacks.onPreview(tool.id, state),
        onCommit: (annotation, ctx) => {
          this.createAnnotation(pageIndex, annotation, ctx, documentId);
          if (this.getToolBehavior(tool, 'deactivateToolAfterCreate')) {
            this.setActiveTool(null, documentId);
          }
          if (this.getToolBehavior(tool, 'selectAfterCreate')) {
            this.selectAnnotation(pageIndex, annotation.id, documentId);
          }
        },
        getTool: () => this.state.tools.find((t) => t.id === tool.id),
      };

      const unregister = this.interactionManager.registerHandlers({
        documentId,
        modeId: tool.interaction.mode ?? tool.id,
        handlers: factory.create(context),
        pageIndex,
      });

      unregisterFns.push(unregister);
    }

    return () => unregisterFns.forEach((fn) => fn());
  }

  // ─────────────────────────────────────────────────────────
  // Helper Methods
  // ─────────────────────────────────────────────────────────

  private getDocumentState(documentId?: string): AnnotationDocumentState {
    const id = documentId ?? this.getActiveDocumentId();
    const docState = this.state.documents[id];
    if (!docState) {
      throw new Error(`Annotation state not found for document: ${id}`);
    }
    return docState;
  }

  private getAllAnnotations(documentId: string, doc: PdfDocumentObject) {
    const task = this.engine.getAllAnnotations(doc);
    task.wait((annotations) => {
      this.dispatch(setAnnotations(documentId, annotations));

      // Mark initial load as complete
      this.isInitialLoadComplete.set(documentId, true);

      // Process any queued imports
      const queue = this.importQueue.get(documentId);
      if (queue && queue.length > 0) {
        this.processImportQueue(documentId);
      }

      this.events$.emit({
        type: 'loaded',
        documentId,
        total: Object.values(annotations).reduce(
          (sum, pageAnnotations) => sum + pageAnnotations.length,
          0,
        ),
      });
    }, ignore);
  }

  private getPageAnnotations(
    options: GetPageAnnotationsOptions,
    documentId?: string,
  ): Task<PdfAnnotationObject[], PdfErrorReason> {
    const { pageIndex } = options;
    const id = documentId ?? this.getActiveDocumentId();

    const docState = this.getCoreDocument(id);
    const doc = docState?.document;
    if (!doc) {
      return PdfTaskHelper.reject({ code: PdfErrorCode.NotFound, message: 'Document not found' });
    }

    const page = doc.pages.find((p: any) => p.index === pageIndex);
    if (!page) {
      return PdfTaskHelper.reject({ code: PdfErrorCode.NotFound, message: 'Page not found' });
    }

    return this.engine.getPageAnnotations(doc, page);
  }

  private getSelectedAnnotation(documentId?: string): TrackedAnnotation | null {
    return getSelectedAnnotation(this.getDocumentState(documentId));
  }

  private getAnnotationById(id: string, documentId?: string): TrackedAnnotation | null {
    const docState = this.getDocumentState(documentId);
    return getAnnotationByUid(docState, id);
  }

  private renderAnnotation(
    { pageIndex, annotation, options }: RenderAnnotationOptions,
    documentId?: string,
  ) {
    const id = documentId ?? this.getActiveDocumentId();
    const docState = this.getCoreDocument(id);
    const doc = docState?.document;

    if (!doc) {
      return PdfTaskHelper.reject({ code: PdfErrorCode.NotFound, message: 'Document not found' });
    }

    const page = doc.pages.find((page: any) => page.index === pageIndex);
    if (!page) {
      return PdfTaskHelper.reject({ code: PdfErrorCode.NotFound, message: 'Page not found' });
    }

    return this.engine.renderPageAnnotation(doc, page, annotation, options);
  }

  private importAnnotations(
    items: ImportAnnotationItem<PdfAnnotationObject>[],
    documentId?: string,
  ) {
    const id = documentId ?? this.getActiveDocumentId();

    // If initial load hasn't completed, queue the items
    if (!this.isInitialLoadComplete.get(id)) {
      const queue = this.importQueue.get(id) || [];
      queue.push(...items);
      this.importQueue.set(id, queue);
      return;
    }

    // Otherwise, import immediately
    this.processImportItems(id, items);
  }

  private processImportQueue(documentId: string) {
    const queue = this.importQueue.get(documentId);
    if (!queue || queue.length === 0) return;

    const items = [...queue];
    this.importQueue.set(documentId, []); // Clear the queue
    this.processImportItems(documentId, items);
  }

  private processImportItems(
    documentId: string,
    items: ImportAnnotationItem<PdfAnnotationObject>[],
  ) {
    const contexts = this.pendingContexts.get(documentId);
    if (!contexts) return;

    for (const item of items) {
      const { annotation, ctx } = item;
      const pageIndex = annotation.pageIndex;
      const id = annotation.id;

      this.dispatch(createAnnotation(documentId, pageIndex, annotation));
      if (ctx) contexts.set(id, ctx);
    }

    if (this.config.autoCommit !== false) this.commit(documentId);
  }

  private createAnnotation<A extends PdfAnnotationObject>(
    pageIndex: number,
    annotation: A,
    ctx?: AnnotationCreateContext<A>,
    documentId?: string,
  ) {
    const docId = documentId ?? this.getActiveDocumentId();

    // Prevent creating annotations without permission
    if (!this.checkPermission(docId, PdfPermissionFlag.ModifyAnnotations)) {
      this.logger.debug(
        'AnnotationPlugin',
        'CreateAnnotation',
        `Cannot create annotation: document ${docId} lacks ModifyAnnotations permission`,
      );
      return;
    }

    const id = annotation.id;
    const contexts = this.pendingContexts.get(docId);
    if (!contexts) return;

    const newAnnotation = {
      ...annotation,
      author: annotation.author ?? this.config.annotationAuthor,
    };
    const execute = () => {
      this.dispatch(createAnnotation(docId, pageIndex, newAnnotation));
      if (ctx) contexts.set(id, ctx);
      this.events$.emit({
        type: 'create',
        documentId: docId,
        annotation: newAnnotation,
        pageIndex,
        ctx,
        committed: false,
      });
    };

    if (!this.history) {
      execute();
      if (this.config.autoCommit) this.commit(docId);
      return;
    }
    const command: Command<AnnotationCommandMetadata> = {
      execute,
      undo: () => {
        contexts.delete(id);
        this.dispatch(deselectAnnotation(docId));
        this.dispatch(deleteAnnotation(docId, pageIndex, id));
        this.events$.emit({
          type: 'delete',
          documentId: docId,
          annotation: newAnnotation,
          pageIndex,
          committed: false,
        });
      },
      metadata: { annotationIds: [id] },
    };
    const historyScope = this.history.forDocument(docId);
    historyScope.register(command, this.ANNOTATION_HISTORY_TOPIC);
  }

  private buildPatch(original: PdfAnnotationObject, patch: Partial<PdfAnnotationObject>) {
    if ('rect' in patch) return patch;

    return this.transformAnnotation(original, {
      type: 'property-update',
      changes: patch,
    });
  }

  private updateAnnotation(
    pageIndex: number,
    id: string,
    patch: Partial<PdfAnnotationObject>,
    documentId?: string,
  ) {
    const docId = documentId ?? this.getActiveDocumentId();

    // Prevent updating annotations without permission
    if (!this.checkPermission(docId, PdfPermissionFlag.ModifyAnnotations)) {
      this.logger.debug(
        'AnnotationPlugin',
        'UpdateAnnotation',
        `Cannot update annotation: document ${docId} lacks ModifyAnnotations permission`,
      );
      return;
    }

    const docState = this.getDocumentState(docId);
    const originalObject = docState.byUid[id].object;
    const finalPatch = this.buildPatch(originalObject, {
      ...patch,
      author: patch.author ?? this.config.annotationAuthor,
    });

    const execute = () => {
      this.dispatch(patchAnnotation(docId, pageIndex, id, finalPatch));
      this.events$.emit({
        type: 'update',
        documentId: docId,
        annotation: originalObject,
        pageIndex,
        patch: finalPatch,
        committed: false,
      });
    };

    if (!this.history) {
      execute();
      if (this.config.autoCommit !== false) {
        this.commit(docId);
      }
      return;
    }
    const originalPatch = Object.fromEntries(
      Object.keys(patch).map((key) => [key, originalObject[key as keyof PdfAnnotationObject]]),
    );
    const command: Command<AnnotationCommandMetadata> = {
      execute,
      undo: () => {
        this.dispatch(patchAnnotation(docId, pageIndex, id, originalPatch));
        this.events$.emit({
          type: 'update',
          documentId: docId,
          annotation: originalObject,
          pageIndex,
          patch: originalPatch,
          committed: false,
        });
      },
      metadata: { annotationIds: [id] },
    };
    const historyScope = this.history.forDocument(docId);
    historyScope.register(command, this.ANNOTATION_HISTORY_TOPIC);
  }

  private deleteAnnotation(pageIndex: number, id: string, documentId?: string) {
    const docId = documentId ?? this.getActiveDocumentId();

    // Prevent deleting annotations without permission
    if (!this.checkPermission(docId, PdfPermissionFlag.ModifyAnnotations)) {
      this.logger.debug(
        'AnnotationPlugin',
        'DeleteAnnotation',
        `Cannot delete annotation: document ${docId} lacks ModifyAnnotations permission`,
      );
      return;
    }

    const docState = this.getDocumentState(docId);
    const originalAnnotation = docState.byUid[id]?.object;
    if (!originalAnnotation) return;

    // Collect IRT children to delete (cascade delete)
    const irtChildren = getIRTChildIds(docState, id);
    const childAnnotations = irtChildren
      .map((child) => docState.byUid[child.id]?.object)
      .filter((obj): obj is PdfAnnotationObject => obj !== undefined);

    const execute = () => {
      // Delete IRT children first
      for (const child of irtChildren) {
        const childObj = docState.byUid[child.id]?.object;
        if (childObj) {
          this.dispatch(deleteAnnotation(docId, child.pageIndex, child.id));
          this.events$.emit({
            type: 'delete',
            documentId: docId,
            annotation: childObj,
            pageIndex: child.pageIndex,
            committed: false,
          });
        }
      }
      // Then delete the parent
      this.dispatch(deselectAnnotation(docId));
      this.dispatch(deleteAnnotation(docId, pageIndex, id));
      this.events$.emit({
        type: 'delete',
        documentId: docId,
        annotation: originalAnnotation,
        pageIndex,
        committed: false,
      });
    };

    if (!this.history) {
      execute();
      if (this.config.autoCommit !== false) this.commit(docId);
      return;
    }
    const command: Command<AnnotationCommandMetadata> = {
      execute,
      undo: () => {
        // Restore parent first
        this.dispatch(createAnnotation(docId, pageIndex, originalAnnotation));
        this.events$.emit({
          type: 'create',
          documentId: docId,
          annotation: originalAnnotation,
          pageIndex,
          committed: false,
        });
        // Then restore children
        for (const childObj of childAnnotations) {
          this.dispatch(createAnnotation(docId, childObj.pageIndex, childObj));
          this.events$.emit({
            type: 'create',
            documentId: docId,
            annotation: childObj,
            pageIndex: childObj.pageIndex,
            committed: false,
          });
        }
      },
      metadata: { annotationIds: [id, ...irtChildren.map((c) => c.id)] },
    };
    const historyScope = this.history.forDocument(docId);
    historyScope.register(command, this.ANNOTATION_HISTORY_TOPIC);
  }

  private deleteAnnotationsMethod(
    annotations: Array<{ pageIndex: number; id: string }>,
    documentId?: string,
  ): void {
    for (const { pageIndex, id } of annotations) {
      this.deleteAnnotation(pageIndex, id, documentId);
    }
  }

  private purgeAnnotationMethod(pageIndex: number, id: string, documentId?: string): void {
    const docId = documentId ?? this.getActiveDocumentId();
    this.dispatch(purgeAnnotation(docId, pageIndex, id));
  }

  private selectAnnotation(pageIndex: number, id: string, documentId?: string) {
    const docId = documentId ?? this.getActiveDocumentId();

    // Check if the annotation is part of a group
    if (this.isInGroupMethod(id, docId)) {
      // Select all group members
      const members = this.getGroupMembersMethod(id, docId);
      const memberIds = members.map((m) => m.object.id);
      this.dispatch(setSelection(docId, memberIds));
    } else {
      // Normal single selection
      this.dispatch(selectAnnotation(docId, pageIndex, id));
    }

    // Page activity is managed centrally in onStoreUpdated via updateAnnotationSelectionActivity
  }

  private deselectAnnotation(documentId?: string) {
    const docId = documentId ?? this.getActiveDocumentId();
    this.dispatch(deselectAnnotation(docId));
    // Page activity is managed centrally in onStoreUpdated via updateAnnotationSelectionActivity
  }

  /**
   * Derive page activity from the current annotation selection.
   * Called from onStoreUpdated whenever selectedUids changes,
   * so ALL selection code paths are covered automatically.
   */
  private updateAnnotationSelectionActivity(docId: string, docState: AnnotationDocumentState) {
    if (docState.selectedUids.length === 0) {
      this.interactionManager?.releasePageActivity(docId, 'annotation-selection');
      return;
    }
    // Claim for the page of the first selected annotation
    const firstUid = docState.selectedUids[0];
    const ta = docState.byUid[firstUid];
    if (ta) {
      this.interactionManager?.claimPageActivity(
        docId,
        'annotation-selection',
        ta.object.pageIndex,
      );
    }
  }

  // ─────────────────────────────────────────────────────────
  // Multi-Select Methods
  // ─────────────────────────────────────────────────────────

  private getSelectedAnnotationsMethod(documentId?: string): TrackedAnnotation[] {
    return getSelectedAnnotations(this.getDocumentState(documentId));
  }

  private getSelectedAnnotationIdsMethod(documentId?: string): string[] {
    return getSelectedAnnotationIds(this.getDocumentState(documentId));
  }

  private toggleSelectionMethod(pageIndex: number, id: string, documentId?: string) {
    const docId = documentId ?? this.getActiveDocumentId();
    const docState = this.getDocumentState(docId);

    if (docState.selectedUids.includes(id)) {
      this.dispatch(removeFromSelection(docId, id));
    } else {
      if (this.isInGroupMethod(id, docId)) {
        const members = this.getGroupMembersMethod(id, docId);
        for (const member of members) {
          if (!docState.selectedUids.includes(member.object.id)) {
            this.dispatch(addToSelection(docId, member.object.pageIndex, member.object.id));
          }
        }
      } else {
        this.dispatch(addToSelection(docId, pageIndex, id));
      }
    }
  }

  private addToSelectionMethod(pageIndex: number, id: string, documentId?: string) {
    const docId = documentId ?? this.getActiveDocumentId();
    this.dispatch(addToSelection(docId, pageIndex, id));
  }

  private removeFromSelectionMethod(id: string, documentId?: string) {
    const docId = documentId ?? this.getActiveDocumentId();
    this.dispatch(removeFromSelection(docId, id));
  }

  private setSelectionMethod(ids: string[], documentId?: string) {
    const docId = documentId ?? this.getActiveDocumentId();
    this.dispatch(setSelection(docId, ids));
  }

  // ─────────────────────────────────────────────────────────
  // Attached Links Methods
  // ─────────────────────────────────────────────────────────

  private getAttachedLinksMethod(annotationId: string, documentId?: string): TrackedAnnotation[] {
    return getAttachedLinks(this.getDocumentState(documentId), annotationId);
  }

  private hasAttachedLinksMethod(annotationId: string, documentId?: string): boolean {
    return this.getAttachedLinksMethod(annotationId, documentId).length > 0;
  }

  private deleteAttachedLinksMethod(annotationId: string, documentId?: string): void {
    const links = this.getAttachedLinksMethod(annotationId, documentId);
    for (const link of links) {
      this.deleteAnnotation(link.object.pageIndex, link.object.id, documentId);
    }
  }

  // ─────────────────────────────────────────────────────────
  // Annotation Grouping Methods
  // ─────────────────────────────────────────────────────────

  /**
   * Group the currently selected annotations.
   * The first selected annotation becomes the group leader.
   * All other selected annotations get their IRT set to the leader's ID with RT = Group.
   */
  private groupAnnotationsMethod(documentId?: string): void {
    const docId = documentId ?? this.getActiveDocumentId();

    // Prevent grouping without permission
    if (!this.checkPermission(docId, PdfPermissionFlag.ModifyAnnotations)) {
      this.logger.debug(
        'AnnotationPlugin',
        'GroupAnnotations',
        `Cannot group annotations: document ${docId} lacks ModifyAnnotations permission`,
      );
      return;
    }

    const selected = this.getSelectedAnnotationsMethod(docId);
    if (selected.length < 2) {
      this.logger.debug(
        'AnnotationPlugin',
        'GroupAnnotations',
        'Need at least 2 annotations to group',
      );
      return;
    }

    const leader = selected[0];
    const members = selected.slice(1);

    // Update all members to point to leader with RT = Group
    const patches = members.map((ta) => ({
      pageIndex: ta.object.pageIndex,
      id: ta.object.id,
      patch: {
        inReplyToId: leader.object.id,
        replyType: PdfAnnotationReplyType.Group,
      } as Partial<PdfAnnotationObject>,
    }));

    this.updateAnnotationsMethod(patches, docId);
  }

  /**
   * Ungroup all annotations in the group containing the specified annotation.
   * Clears IRT and RT from all group members (the leader doesn't have them).
   */
  private ungroupAnnotationsMethod(annotationId: string, documentId?: string): void {
    const docId = documentId ?? this.getActiveDocumentId();

    // Prevent ungrouping without permission
    if (!this.checkPermission(docId, PdfPermissionFlag.ModifyAnnotations)) {
      this.logger.debug(
        'AnnotationPlugin',
        'UngroupAnnotations',
        `Cannot ungroup annotations: document ${docId} lacks ModifyAnnotations permission`,
      );
      return;
    }

    const members = this.getGroupMembersMethod(annotationId, docId);

    // Clear IRT and RT from all members that have them (not the leader)
    const patches = members
      .filter((ta) => ta.object.inReplyToId && ta.object.replyType === PdfAnnotationReplyType.Group)
      .map((ta) => ({
        pageIndex: ta.object.pageIndex,
        id: ta.object.id,
        patch: {
          inReplyToId: undefined,
          replyType: undefined,
        } as Partial<PdfAnnotationObject>,
      }));

    if (patches.length > 0) {
      this.updateAnnotationsMethod(patches, docId);
    }
  }

  /**
   * Get all annotations in the same group as the specified annotation.
   */
  private getGroupMembersMethod(
    annotationId: string,
    documentId?: string,
  ): TrackedAnnotation<PdfAnnotationObject>[] {
    return getGroupMembers(this.getDocumentState(documentId), annotationId);
  }

  /**
   * Check if an annotation is part of a group.
   */
  private isInGroupMethod(annotationId: string, documentId?: string): boolean {
    return isInGroup(this.getDocumentState(documentId), annotationId);
  }

  /**
   * Get the available grouping action for the current selection.
   */
  private getGroupingActionMethod(documentId?: string): GroupingAction {
    return getSelectionGroupingAction(this.getDocumentState(documentId));
  }

  // ─────────────────────────────────────────────────────────
  // Multi-Drag Coordination (Internal API for framework components)
  // ─────────────────────────────────────────────────────────

  /**
   * Compute combined constraints from all selected annotations.
   * This finds the "weakest link" in each direction - the annotation with the least
   * room to move determines the group's limit.
   */
  private computeCombinedConstraints(annotations: AnnotationConstraintInfo[]): CombinedConstraints {
    let maxUp = Infinity;
    let maxDown = Infinity;
    let maxLeft = Infinity;
    let maxRight = Infinity;

    for (const anno of annotations) {
      // How far can this annotation move in each direction without leaving its page?
      const upLimit = anno.rect.origin.y;
      const downLimit = anno.pageSize.height - (anno.rect.origin.y + anno.rect.size.height);
      const leftLimit = anno.rect.origin.x;
      const rightLimit = anno.pageSize.width - (anno.rect.origin.x + anno.rect.size.width);

      // Take the minimum (most restrictive) for each direction
      maxUp = Math.min(maxUp, upLimit);
      maxDown = Math.min(maxDown, downLimit);
      maxLeft = Math.min(maxLeft, leftLimit);
      maxRight = Math.min(maxRight, rightLimit);
    }

    // Handle edge case where there are no annotations
    if (!isFinite(maxUp)) maxUp = 0;
    if (!isFinite(maxDown)) maxDown = 0;
    if (!isFinite(maxLeft)) maxLeft = 0;
    if (!isFinite(maxRight)) maxRight = 0;

    return { maxUp, maxDown, maxLeft, maxRight };
  }

  /**
   * Clamp a delta to the combined constraints.
   * Negative y = moving up, positive y = moving down
   * Negative x = moving left, positive x = moving right
   */
  private clampDelta(rawDelta: Position, constraints: CombinedConstraints): Position {
    return {
      x: Math.max(-constraints.maxLeft, Math.min(constraints.maxRight, rawDelta.x)),
      y: Math.max(-constraints.maxUp, Math.min(constraints.maxDown, rawDelta.y)),
    };
  }

  // ─────────────────────────────────────────────────────────
  // Unified Drag API (Plugin owns all logic - framework just calls these)
  // ─────────────────────────────────────────────────────────

  /**
   * Start a unified drag operation.
   * The plugin automatically expands the selection to include attached links.
   * Framework components should call this instead of building their own logic.
   *
   * @param documentId - The document ID
   * @param options - Drag options (annotationIds and pageSize)
   */
  public startDrag(documentId: string, options: UnifiedDragOptions): void {
    const { annotationIds, pageSize } = options;

    // 1. Expand to include attached links for each annotation
    const attachedLinkIds: string[] = [];
    for (const id of annotationIds) {
      const links = this.getAttachedLinksMethod(id, documentId);
      for (const link of links) {
        if (!attachedLinkIds.includes(link.object.id)) {
          attachedLinkIds.push(link.object.id);
        }
      }
    }

    const allParticipantIds = [...annotationIds, ...attachedLinkIds];

    // 2. Store original rects and build constraints for all participants
    const originalRects = new Map<string, Rect>();
    const constraints: AnnotationConstraintInfo[] = [];

    for (const id of allParticipantIds) {
      const ta = this.getAnnotationById(id, documentId);
      if (ta) {
        originalRects.set(id, { ...ta.object.rect });
        constraints.push({
          id,
          rect: ta.object.rect,
          pageIndex: ta.object.pageIndex,
          pageSize,
        });
      }
    }

    // 3. Compute combined constraints
    const combinedConstraints = this.computeCombinedConstraints(constraints);

    // 4. Store state
    const state: UnifiedDragState = {
      documentId,
      isDragging: true,
      primaryIds: annotationIds,
      attachedLinkIds,
      allParticipantIds,
      originalRects,
      delta: { x: 0, y: 0 },
      combinedConstraints,
    };
    this.unifiedDragStates.set(documentId, state);

    // 5. Emit start event for all participants (no patches yet - delta is 0)
    this.unifiedDrag$.emit({ documentId, type: 'start', state, previewPatches: {} });
  }

  /**
   * Compute preview patches for all drag participants.
   * Uses transformAnnotation to properly handle vertices, inkList, etc.
   */
  private computeDragPreviewPatches(
    state: UnifiedDragState,
    documentId: string,
  ): Record<string, Partial<PdfAnnotationObject>> {
    const previewPatches: Record<string, Partial<PdfAnnotationObject>> = {};

    for (const id of state.allParticipantIds) {
      const ta = this.getAnnotationById(id, documentId);
      if (!ta) continue;

      const originalRect = state.originalRects.get(id);
      if (!originalRect) continue;

      const newRect: Rect = {
        ...originalRect,
        origin: {
          x: originalRect.origin.x + state.delta.x,
          y: originalRect.origin.y + state.delta.y,
        },
      };

      // Plugin does the transform - handles ink, polygon, line, etc.
      previewPatches[id] = this.transformAnnotation(ta.object, {
        type: 'move',
        changes: { rect: newRect },
      });
    }

    return previewPatches;
  }

  /**
   * Update the drag delta during a unified drag operation.
   * Returns the clamped delta synchronously for the caller's preview.
   *
   * @param documentId - The document ID
   * @param rawDelta - The unconstrained delta from the drag gesture
   * @returns The clamped delta
   */
  public updateDrag(documentId: string, rawDelta: Position): Position {
    const state = this.unifiedDragStates.get(documentId);
    if (!state?.isDragging) {
      return { x: 0, y: 0 };
    }

    const clampedDelta = this.clampDelta(rawDelta, state.combinedConstraints);

    // Update state
    const newState: UnifiedDragState = {
      ...state,
      delta: clampedDelta,
    };
    this.unifiedDragStates.set(documentId, newState);

    // Compute preview patches for ALL participants
    const previewPatches = this.computeDragPreviewPatches(newState, documentId);

    // Emit update with patches - components just apply them!
    this.unifiedDrag$.emit({ documentId, type: 'update', state: newState, previewPatches });

    return clampedDelta;
  }

  /**
   * Commit the drag - plugin builds and applies ALL patches.
   * This is the key method that centralizes patch building in the plugin.
   *
   * @param documentId - The document ID
   */
  public commitDrag(documentId: string): void {
    const state = this.unifiedDragStates.get(documentId);
    if (!state) return;

    const finalDelta = state.delta;

    if (finalDelta.x !== 0 || finalDelta.y !== 0) {
      // Build patches for ALL participants (primary + attached links)
      const patches: Array<{ pageIndex: number; id: string; patch: Partial<PdfAnnotationObject> }> =
        [];

      for (const id of state.allParticipantIds) {
        const ta = this.getAnnotationById(id, documentId);
        if (!ta) continue;

        const originalRect = state.originalRects.get(id) ?? ta.object.rect;
        const newRect: Rect = {
          ...originalRect,
          origin: {
            x: originalRect.origin.x + finalDelta.x,
            y: originalRect.origin.y + finalDelta.y,
          },
        };

        const patch = this.transformAnnotation(ta.object, {
          type: 'move',
          changes: { rect: newRect },
        });

        patches.push({ pageIndex: ta.object.pageIndex, id, patch });
      }

      // Apply all patches in one batch
      if (patches.length > 0) {
        this.updateAnnotationsMethod(patches, documentId);
      }
    }

    // Emit end event with final patches
    const endPatches = this.computeDragPreviewPatches(state, documentId);
    this.unifiedDrag$.emit({
      documentId,
      type: 'end',
      state: { ...state, isDragging: false },
      previewPatches: endPatches,
    });

    // Cleanup
    this.unifiedDragStates.delete(documentId);
  }

  /**
   * Cancel the drag without committing.
   *
   * @param documentId - The document ID
   */
  public cancelDrag(documentId: string): void {
    const state = this.unifiedDragStates.get(documentId);
    if (!state) return;

    // Emit cancel with empty patches (components should reset to original)
    this.unifiedDrag$.emit({
      documentId,
      type: 'cancel',
      state: { ...state, isDragging: false, delta: { x: 0, y: 0 } },
      previewPatches: {},
    });

    this.unifiedDragStates.delete(documentId);
  }

  /**
   * Get the current unified drag state for a document.
   */
  public getDragState(documentId: string): UnifiedDragState | null {
    return this.unifiedDragStates.get(documentId) ?? null;
  }

  /**
   * Subscribe to unified drag state changes.
   * Framework components use this for preview updates.
   */
  public get onDragChange() {
    return this.unifiedDrag$.on;
  }

  // ─────────────────────────────────────────────────────────
  // Unified Resize API (Plugin owns all logic - framework just calls these)
  // ─────────────────────────────────────────────────────────

  /**
   * Compute the union bounding box of multiple rects.
   */
  private computeUnifiedGroupBoundingBox(rects: Rect[]): Rect {
    if (rects.length === 0) {
      return { origin: { x: 0, y: 0 }, size: { width: 0, height: 0 } };
    }

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    for (const rect of rects) {
      minX = Math.min(minX, rect.origin.x);
      minY = Math.min(minY, rect.origin.y);
      maxX = Math.max(maxX, rect.origin.x + rect.size.width);
      maxY = Math.max(maxY, rect.origin.y + rect.size.height);
    }

    return {
      origin: { x: minX, y: minY },
      size: { width: maxX - minX, height: maxY - minY },
    };
  }

  /**
   * Compute relative positions for annotations within a group bounding box.
   */
  private computeUnifiedRelativePositions(
    annotations: Array<{
      id: string;
      rect: Rect;
      pageIndex: number;
      isAttachedLink: boolean;
      parentId?: string;
    }>,
    groupBox: Rect,
  ): UnifiedResizeAnnotationInfo[] {
    return annotations.map((anno) => ({
      id: anno.id,
      originalRect: anno.rect,
      pageIndex: anno.pageIndex,
      isAttachedLink: anno.isAttachedLink,
      parentId: anno.parentId,
      relativeX:
        groupBox.size.width > 0
          ? (anno.rect.origin.x - groupBox.origin.x) / groupBox.size.width
          : 0,
      relativeY:
        groupBox.size.height > 0
          ? (anno.rect.origin.y - groupBox.origin.y) / groupBox.size.height
          : 0,
      relativeWidth: groupBox.size.width > 0 ? anno.rect.size.width / groupBox.size.width : 1,
      relativeHeight: groupBox.size.height > 0 ? anno.rect.size.height / groupBox.size.height : 1,
    }));
  }

  /**
   * Compute new rects for all annotations based on the new group bounding box.
   */
  private computeUnifiedResizedRects(
    participatingAnnotations: UnifiedResizeAnnotationInfo[],
    newGroupBox: Rect,
    minSize: number = 10,
  ): Map<string, Rect> {
    const result = new Map<string, Rect>();

    for (const anno of participatingAnnotations) {
      const newWidth = Math.max(minSize, anno.relativeWidth * newGroupBox.size.width);
      const newHeight = Math.max(minSize, anno.relativeHeight * newGroupBox.size.height);

      result.set(anno.id, {
        origin: {
          x: newGroupBox.origin.x + anno.relativeX * newGroupBox.size.width,
          y: newGroupBox.origin.y + anno.relativeY * newGroupBox.size.height,
        },
        size: {
          width: newWidth,
          height: newHeight,
        },
      });
    }

    return result;
  }

  /**
   * Compute preview patches for all resize participants.
   * Uses transformAnnotation to properly handle vertices, inkList, etc.
   */
  private computeResizePreviewPatches(
    computedRects: Map<string, Rect>,
    documentId: string,
  ): Record<string, Partial<PdfAnnotationObject>> {
    const previewPatches: Record<string, Partial<PdfAnnotationObject>> = {};

    for (const [id, newRect] of computedRects) {
      const ta = this.getAnnotationById(id, documentId);
      if (!ta) continue;

      // Plugin does the transform - handles ink, polygon, line, etc.
      previewPatches[id] = this.transformAnnotation(ta.object, {
        type: 'resize',
        changes: { rect: newRect },
      });
    }

    return previewPatches;
  }

  /**
   * Start a unified resize operation.
   * The plugin automatically expands the selection to include attached links.
   *
   * @param documentId - The document ID
   * @param options - Resize options
   */
  public startResize(documentId: string, options: UnifiedResizeOptions): void {
    const { annotationIds, pageSize, resizeHandle } = options;

    // 1. Expand to include attached links for each annotation
    const attachedLinkIds: string[] = [];
    const annotationsWithLinks: Array<{
      id: string;
      rect: Rect;
      pageIndex: number;
      isAttachedLink: boolean;
      parentId?: string;
    }> = [];

    for (const id of annotationIds) {
      const ta = this.getAnnotationById(id, documentId);
      if (ta) {
        annotationsWithLinks.push({
          id,
          rect: ta.object.rect,
          pageIndex: ta.object.pageIndex,
          isAttachedLink: false,
        });

        // Get attached links for this annotation
        const links = this.getAttachedLinksMethod(id, documentId);
        for (const link of links) {
          if (!attachedLinkIds.includes(link.object.id)) {
            attachedLinkIds.push(link.object.id);
            annotationsWithLinks.push({
              id: link.object.id,
              rect: link.object.rect,
              pageIndex: link.object.pageIndex,
              isAttachedLink: true,
              parentId: id,
            });
          }
        }
      }
    }

    const allParticipantIds = [...annotationIds, ...attachedLinkIds];

    // 2. Compute the group bounding box
    const rects = annotationsWithLinks.map((a) => a.rect);
    const groupBox = this.computeUnifiedGroupBoundingBox(rects);

    // 3. Compute relative positions for each annotation
    const participatingAnnotations = this.computeUnifiedRelativePositions(
      annotationsWithLinks,
      groupBox,
    );

    // 4. Compute initial rects
    const computedRects = this.computeUnifiedResizedRects(participatingAnnotations, groupBox);

    // 5. Store state
    const state: UnifiedResizeState = {
      documentId,
      isResizing: true,
      primaryIds: annotationIds,
      attachedLinkIds,
      allParticipantIds,
      originalGroupBox: groupBox,
      currentGroupBox: groupBox,
      participatingAnnotations,
      resizeHandle,
      computedRects,
    };
    this.unifiedResizeStates.set(documentId, state);

    // 6. Emit start event (no patches yet - initial state)
    const startPatches = this.computeResizePreviewPatches(computedRects, documentId);
    this.unifiedResize$.emit({
      documentId,
      type: 'start',
      state,
      computedRects: Object.fromEntries(computedRects),
      previewPatches: startPatches,
    });
  }

  /**
   * Update the resize with a new group bounding box.
   * Returns the computed rects synchronously for immediate preview use.
   *
   * @param documentId - The document ID
   * @param newGroupBox - The new group bounding box
   * @returns Record of annotation ID to new rect
   */
  public updateResize(documentId: string, newGroupBox: Rect): Record<string, Rect> {
    const state = this.unifiedResizeStates.get(documentId);
    if (!state?.isResizing) {
      return {};
    }

    // Compute new rects for all annotations
    const computedRects = this.computeUnifiedResizedRects(
      state.participatingAnnotations,
      newGroupBox,
    );

    // Update state
    const newState: UnifiedResizeState = {
      ...state,
      currentGroupBox: newGroupBox,
      computedRects,
    };
    this.unifiedResizeStates.set(documentId, newState);

    const computedRectsObj = Object.fromEntries(computedRects);

    // Compute preview patches for ALL participants
    const previewPatches = this.computeResizePreviewPatches(computedRects, documentId);

    // Emit for subscribers with patches - components just apply them!
    this.unifiedResize$.emit({
      documentId,
      type: 'update',
      state: newState,
      computedRects: computedRectsObj,
      previewPatches,
    });

    return computedRectsObj;
  }

  /**
   * Commit the resize - plugin builds and applies ALL patches.
   *
   * @param documentId - The document ID
   */
  public commitResize(documentId: string): void {
    const state = this.unifiedResizeStates.get(documentId);
    if (!state) return;

    const computedRects = this.computeUnifiedResizedRects(
      state.participatingAnnotations,
      state.currentGroupBox,
    );

    // Build patches for ALL participants (primary + attached links)
    const patches: Array<{ pageIndex: number; id: string; patch: Partial<PdfAnnotationObject> }> =
      [];

    for (const [id, newRect] of computedRects) {
      const ta = this.getAnnotationById(id, documentId);
      if (!ta) continue;

      const patch = this.transformAnnotation(ta.object, {
        type: 'resize',
        changes: { rect: newRect },
      });

      patches.push({ pageIndex: ta.object.pageIndex, id, patch });
    }

    // Apply all patches in one batch
    if (patches.length > 0) {
      this.updateAnnotationsMethod(patches, documentId);
    }

    // Emit end event with final patches
    const endPatches = this.computeResizePreviewPatches(computedRects, documentId);
    this.unifiedResize$.emit({
      documentId,
      type: 'end',
      state: { ...state, isResizing: false },
      computedRects: Object.fromEntries(computedRects),
      previewPatches: endPatches,
    });

    // Cleanup
    this.unifiedResizeStates.delete(documentId);
  }

  /**
   * Cancel the resize without committing.
   *
   * @param documentId - The document ID
   */
  public cancelResize(documentId: string): void {
    const state = this.unifiedResizeStates.get(documentId);
    if (!state) return;

    // Compute original rects
    const originalRects = this.computeUnifiedResizedRects(
      state.participatingAnnotations,
      state.originalGroupBox,
    );

    // Emit cancel with empty patches (components should reset to original)
    this.unifiedResize$.emit({
      documentId,
      type: 'cancel',
      state: { ...state, isResizing: false, currentGroupBox: state.originalGroupBox },
      computedRects: Object.fromEntries(originalRects),
      previewPatches: {},
    });

    this.unifiedResizeStates.delete(documentId);
  }

  /**
   * Get the current unified resize state for a document.
   */
  public getResizeState(documentId: string): UnifiedResizeState | null {
    return this.unifiedResizeStates.get(documentId) ?? null;
  }

  /**
   * Subscribe to unified resize state changes.
   * Framework components use this for preview updates.
   */
  public get onResizeChange() {
    return this.unifiedResize$.on;
  }

  private updateAnnotationsMethod(
    patches: Array<{ pageIndex: number; id: string; patch: Partial<PdfAnnotationObject> }>,
    documentId?: string,
  ) {
    const docId = documentId ?? this.getActiveDocumentId();

    // Prevent updating annotations without permission
    if (!this.checkPermission(docId, PdfPermissionFlag.ModifyAnnotations)) {
      this.logger.debug(
        'AnnotationPlugin',
        'UpdateAnnotations',
        `Cannot update annotations: document ${docId} lacks ModifyAnnotations permission`,
      );
      return;
    }

    const docState = this.getDocumentState(docId);

    // Build all patches first
    const patchData = patches
      .map(({ pageIndex, id, patch }) => {
        const originalObject = docState.byUid[id]?.object;
        if (!originalObject) return null;

        const finalPatch = this.buildPatch(originalObject, {
          ...patch,
          author: patch.author ?? this.config.annotationAuthor,
        });

        return { pageIndex, id, patch: finalPatch, originalObject };
      })
      .filter((p): p is NonNullable<typeof p> => p !== null);

    if (patchData.length === 0) return;

    const execute = () => {
      for (const { pageIndex, id, patch, originalObject } of patchData) {
        this.dispatch(patchAnnotation(docId, pageIndex, id, patch));
        this.events$.emit({
          type: 'update',
          documentId: docId,
          annotation: originalObject,
          pageIndex,
          patch,
          committed: false,
        });
      }
    };

    if (!this.history) {
      execute();
      if (this.config.autoCommit !== false) {
        this.commit(docId);
      }
      return;
    }

    // Build undo data
    const undoData = patchData.map(({ pageIndex, id, patch, originalObject }) => ({
      pageIndex,
      id,
      originalPatch: Object.fromEntries(
        Object.keys(patch).map((key) => [key, originalObject[key as keyof PdfAnnotationObject]]),
      ),
      originalObject,
    }));

    const command: Command<AnnotationCommandMetadata> = {
      execute,
      undo: () => {
        for (const { pageIndex, id, originalPatch, originalObject } of undoData) {
          this.dispatch(patchAnnotation(docId, pageIndex, id, originalPatch));
          this.events$.emit({
            type: 'update',
            documentId: docId,
            annotation: originalObject,
            pageIndex,
            patch: originalPatch,
            committed: false,
          });
        }
      },
      metadata: { annotationIds: patchData.map((p) => p.id) },
    };

    const historyScope = this.history.forDocument(docId);
    historyScope.register(command, this.ANNOTATION_HISTORY_TOPIC);
  }

  public getActiveTool(documentId?: string): AnnotationTool | null {
    const docState = this.getDocumentState(documentId);
    if (!docState.activeToolId) return null;
    return this.state.tools.find((t) => t.id === docState.activeToolId) ?? null;
  }

  public setActiveTool(toolId: string | null, documentId?: string): void {
    const docId = documentId ?? this.getActiveDocumentId();

    // Prevent activating annotation tools without permission
    // Allow null (deselect tool) even without permission
    if (toolId !== null && !this.checkPermission(docId, PdfPermissionFlag.ModifyAnnotations)) {
      this.logger.debug(
        'AnnotationPlugin',
        'SetActiveTool',
        `Cannot activate tool: document ${docId} lacks ModifyAnnotations permission`,
      );
      return;
    }

    const docState = this.getDocumentState(docId);
    if (toolId === docState.activeToolId) return;

    this.dispatch(setActiveToolId(docId, toolId));

    const tool = this.state.tools.find((t) => t.id === toolId);
    if (tool) {
      this.interactionManager?.forDocument(docId).activate(tool.interaction.mode ?? tool.id);
    } else {
      this.interactionManager?.forDocument(docId).activateDefaultMode();
    }
  }

  public getTool<T extends AnnotationTool>(toolId: string): T | undefined {
    return this.state.tools.find((t) => t.id === toolId) as T | undefined;
  }

  public findToolForAnnotation(annotation: PdfAnnotationObject): AnnotationTool | null {
    let bestTool: AnnotationTool | null = null;
    let bestScore = 0;
    for (const tool of this.state.tools) {
      const score = tool.matchScore(annotation);
      if (score > bestScore) {
        bestScore = score;
        bestTool = tool;
      }
    }
    return bestTool;
  }

  /**
   * Collects all pending annotation changes for a document into a batch.
   * This separates the "what to commit" from "how to commit" for cleaner code.
   */
  private collectPendingChanges(docId: string, doc: PdfDocumentObject): CommitBatch {
    const docState = this.getDocumentState(docId);
    const contexts = this.pendingContexts.get(docId);

    const batch: CommitBatch = {
      creations: [],
      updates: [],
      deletions: [],
      committedUids: [],
      isEmpty: true,
    };

    for (const [uid, ta] of Object.entries(docState.byUid)) {
      if (ta.commitState === 'synced') continue;

      const page = doc.pages.find((p) => p.index === ta.object.pageIndex);
      if (!page) continue;

      batch.committedUids.push(uid);
      batch.isEmpty = false;

      switch (ta.commitState) {
        case 'new':
          batch.creations.push({
            uid,
            ta,
            ctx: contexts?.get(ta.object.id) as AnnotationCreateContext<PdfAnnotationObject>,
          });
          break;
        case 'dirty':
          batch.updates.push({ uid, ta });
          break;
        case 'deleted':
          batch.deletions.push({ uid, ta });
          break;
      }
    }

    return batch;
  }

  /**
   * Executes a batch of pending changes by creating engine tasks.
   * Returns a task that resolves when all operations complete.
   */
  private executeCommitBatch(
    docId: string,
    doc: PdfDocumentObject,
    batch: CommitBatch,
  ): Task<boolean, PdfErrorReason> {
    const task = new Task<boolean, PdfErrorReason>();
    const contexts = this.pendingContexts.get(docId);

    // Track operations for centralized event emission
    const pendingOps: Array<{
      type: 'create' | 'update' | 'delete';
      task: Task<any, PdfErrorReason>;
      ta: TrackedAnnotation;
      uid: string;
      ctx?: AnnotationCreateContext<PdfAnnotationObject>;
    }> = [];

    // Process creations
    for (const { uid, ta, ctx } of batch.creations) {
      const page = doc.pages.find((p) => p.index === ta.object.pageIndex);
      if (!page) continue;

      const createTask = this.engine.createPageAnnotation!(doc, page, ta.object, ctx);
      pendingOps.push({ type: 'create', task: createTask, ta, uid, ctx });
    }

    // Process updates
    for (const { uid, ta } of batch.updates) {
      const page = doc.pages.find((p) => p.index === ta.object.pageIndex);
      if (!page) continue;

      const updateTask = this.engine.updatePageAnnotation!(doc, page, ta.object);
      pendingOps.push({ type: 'update', task: updateTask, ta, uid });
    }

    // Process deletions
    for (const { uid, ta } of batch.deletions) {
      const page = doc.pages.find((p) => p.index === ta.object.pageIndex);
      if (!page) continue;

      // Only call engine if the annotation exists in the PDF (has an id)
      if (ta.object.id) {
        const deleteTask = new Task<any, PdfErrorReason>();
        const removeTask = this.engine.removePageAnnotation!(doc, page, ta.object);
        removeTask.wait(() => deleteTask.resolve(true), deleteTask.fail);
        pendingOps.push({ type: 'delete', task: deleteTask, ta, uid });
      } else {
        // If it was never synced, just remove from state immediately
        this.dispatch(purgeAnnotation(docId, ta.object.pageIndex, uid));
      }
    }

    // Wait for all tasks to complete, then emit events centrally
    const allTasks = pendingOps.map((op) => op.task);
    Task.allSettled(allTasks).wait(
      () => {
        // Emit events for all completed operations
        this.emitCommitEvents(docId, pendingOps, contexts);

        // Update state
        this.dispatch(commitPendingChanges(docId, batch.committedUids));
        task.resolve(true);
      },
      (error) => task.fail(error),
    );

    return task;
  }

  /**
   * Emits commit events for all completed operations.
   * Centralizes event emission for cleaner separation of concerns.
   */
  private emitCommitEvents(
    docId: string,
    operations: Array<{
      type: 'create' | 'update' | 'delete';
      task: Task<any, PdfErrorReason>;
      ta: TrackedAnnotation;
      uid: string;
      ctx?: AnnotationCreateContext<PdfAnnotationObject>;
    }>,
    contexts?: Map<string, unknown>,
  ): void {
    for (const op of operations) {
      // Only emit events for successful operations
      if (op.task.state.stage !== TaskStage.Resolved) continue;

      switch (op.type) {
        case 'create':
          this.events$.emit({
            type: 'create',
            documentId: docId,
            annotation: op.ta.object,
            pageIndex: op.ta.object.pageIndex,
            ctx: op.ctx,
            committed: true,
          });
          contexts?.delete(op.ta.object.id);
          break;

        case 'update':
          this.events$.emit({
            type: 'update',
            documentId: docId,
            annotation: op.ta.object,
            pageIndex: op.ta.object.pageIndex,
            patch: op.ta.object,
            committed: true,
          });
          break;

        case 'delete':
          this.dispatch(purgeAnnotation(docId, op.ta.object.pageIndex, op.uid));
          this.events$.emit({
            type: 'delete',
            documentId: docId,
            annotation: op.ta.object,
            pageIndex: op.ta.object.pageIndex,
            committed: true,
          });
          break;
      }
    }
  }

  /**
   * Attempts to acquire the commit lock for a document.
   * Returns true if acquired, false if a commit is already in progress.
   */
  private acquireCommitLock(docId: string): boolean {
    if (this.commitInProgress.get(docId)) {
      return false;
    }
    this.commitInProgress.set(docId, true);
    return true;
  }

  /**
   * Releases the commit lock for a document.
   */
  private releaseCommitLock(docId: string): void {
    this.commitInProgress.set(docId, false);
  }

  private commit(documentId?: string): Task<boolean, PdfErrorReason> {
    const docId = documentId ?? this.getActiveDocumentId();
    const docState = this.getDocumentState(docId);

    // Early exit if nothing to commit
    if (!docState.hasPendingChanges) {
      return PdfTaskHelper.resolve(true);
    }

    // Guard against concurrent commits
    if (!this.acquireCommitLock(docId)) {
      return PdfTaskHelper.resolve(true);
    }

    // Get the document
    const coreDocState = this.getCoreDocument(docId);
    const doc = coreDocState?.document;
    if (!doc) {
      this.releaseCommitLock(docId);
      return PdfTaskHelper.reject({ code: PdfErrorCode.NotFound, message: 'Document not found' });
    }

    // Collect pending changes
    const batch = this.collectPendingChanges(docId, doc);
    if (batch.isEmpty) {
      this.releaseCommitLock(docId);
      return PdfTaskHelper.resolve(true);
    }

    // Execute the batch
    const task = new Task<boolean, PdfErrorReason>();
    this.executeCommitBatch(docId, doc, batch).wait(
      () => {
        this.releaseCommitLock(docId);

        // Check if new items were added during the commit
        const updatedDocState = this.getDocumentState(docId);
        if (updatedDocState.hasPendingChanges) {
          // Chain the follow-up commit to this task
          this.commit(docId).wait(
            (result) => task.resolve(result),
            (error) => task.fail(error),
          );
        } else {
          task.resolve(true);
        }
      },
      (error) => {
        this.releaseCommitLock(docId);
        task.fail(error);
      },
    );

    return task;
  }

  /**
   * Gets the effective behavior setting for a tool, checking tool-specific config first,
   * then falling back to plugin config.
   */
  private getToolBehavior(
    tool: AnnotationTool,
    setting: 'deactivateToolAfterCreate' | 'selectAfterCreate',
  ): boolean {
    // Check if tool has specific behavior setting
    if (tool.behavior?.[setting] !== undefined) {
      return tool.behavior[setting];
    }

    // Fall back to plugin config
    return this.config[setting] !== false;
  }
}
