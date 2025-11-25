import { BasePlugin, createBehaviorEmitter, PluginRegistry, Listener } from '@embedpdf/core';
import {
  ignore,
  PdfAnnotationObject,
  PdfDocumentObject,
  PdfErrorReason,
  Task,
  PdfTaskHelper,
  PdfErrorCode,
  AnnotationCreateContext,
  uuidV4,
  PdfAnnotationSubtype,
} from '@embedpdf/models';
import {
  AnnotationCapability,
  AnnotationEvent,
  AnnotationPluginConfig,
  AnnotationState,
  AnnotationDocumentState,
  AnnotationScope,
  AnnotationStateChangeEvent,
  AnnotationActiveToolChangeEvent,
  AnnotationToolsChangeEvent,
  GetPageAnnotationsOptions,
  ImportAnnotationItem,
  RenderAnnotationOptions,
  TrackedAnnotation,
  TransformOptions,
} from './types';
import {
  setAnnotations,
  selectAnnotation,
  deselectAnnotation,
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
import { getAnnotationByUid, getSelectedAnnotation } from './selectors';
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

  private handlerFactories = new Map<PdfAnnotationSubtype, HandlerFactory<any>>();
  private readonly activeTool$ = createBehaviorEmitter<AnnotationActiveToolChangeEvent>();
  private readonly events$ = createBehaviorEmitter<AnnotationEvent>();
  private readonly toolsChange$ = createBehaviorEmitter<AnnotationToolsChangeEvent>();
  private readonly patchRegistry = new PatchRegistry();

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
          this.selection.enableForMode(tool.interaction.mode ?? tool.id);
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

    this.selection?.onEndSelection(({ documentId }) => {
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
      getAnnotationById: (id) => this.getAnnotationById(id),
      selectAnnotation: (pageIndex, id) => this.selectAnnotation(pageIndex, id),
      deselectAnnotation: () => this.deselectAnnotation(),
      importAnnotations: (items) => this.importAnnotations(items),
      createAnnotation: (pageIndex, anno, ctx) => this.createAnnotation(pageIndex, anno, ctx),
      updateAnnotation: (pageIndex, id, patch) => this.updateAnnotation(pageIndex, id, patch),
      deleteAnnotation: (pageIndex, id) => this.deleteAnnotation(pageIndex, id),
      renderAnnotation: (options) => this.renderAnnotation(options),
      commit: () => this.commit(),

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
      getAnnotationById: (id) => this.getAnnotationById(id, documentId),
      selectAnnotation: (pageIndex, id) => this.selectAnnotation(pageIndex, id, documentId),
      deselectAnnotation: () => this.deselectAnnotation(documentId),
      getActiveTool: () => this.getActiveTool(documentId),
      setActiveTool: (toolId) => this.setActiveTool(toolId, documentId),
      findToolForAnnotation: (anno) => this.findToolForAnnotation(anno),
      importAnnotations: (items) => this.importAnnotations(items, documentId),
      createAnnotation: (pageIndex, anno, ctx) =>
        this.createAnnotation(pageIndex, anno, ctx, documentId),
      updateAnnotation: (pageIndex, id, patch) =>
        this.updateAnnotation(pageIndex, id, patch, documentId),
      deleteAnnotation: (pageIndex, id) => this.deleteAnnotation(pageIndex, id, documentId),
      renderAnnotation: (options) => this.renderAnnotation(options, documentId),
      commit: () => this.commit(documentId),
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
    const id = annotation.id;
    const docId = documentId ?? this.getActiveDocumentId();
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
    const command: Command = {
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
    const command: Command = {
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
    };
    const historyScope = this.history.forDocument(docId);
    historyScope.register(command, this.ANNOTATION_HISTORY_TOPIC);
  }

  private deleteAnnotation(pageIndex: number, id: string, documentId?: string) {
    const docId = documentId ?? this.getActiveDocumentId();
    const docState = this.getDocumentState(docId);
    const originalAnnotation = docState.byUid[id]?.object;
    if (!originalAnnotation) return;

    const execute = () => {
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
    const command: Command = {
      execute,
      undo: () => {
        this.dispatch(createAnnotation(docId, pageIndex, originalAnnotation));
        this.events$.emit({
          type: 'create',
          documentId: docId,
          annotation: originalAnnotation,
          pageIndex,
          committed: false,
        });
      },
    };
    const historyScope = this.history.forDocument(docId);
    historyScope.register(command, this.ANNOTATION_HISTORY_TOPIC);
  }

  private selectAnnotation(pageIndex: number, id: string, documentId?: string) {
    const docId = documentId ?? this.getActiveDocumentId();
    this.dispatch(selectAnnotation(docId, pageIndex, id));
  }

  private deselectAnnotation(documentId?: string) {
    const docId = documentId ?? this.getActiveDocumentId();
    this.dispatch(deselectAnnotation(docId));
  }

  public getActiveTool(documentId?: string): AnnotationTool | null {
    const docState = this.getDocumentState(documentId);
    if (!docState.activeToolId) return null;
    return this.state.tools.find((t) => t.id === docState.activeToolId) ?? null;
  }

  public setActiveTool(toolId: string | null, documentId?: string): void {
    const docId = documentId ?? this.getActiveDocumentId();
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

  private commit(documentId?: string): Task<boolean, PdfErrorReason> {
    const task = new Task<boolean, PdfErrorReason>();
    const docId = documentId ?? this.getActiveDocumentId();
    const docState = this.getDocumentState(docId);

    if (!docState.hasPendingChanges) return PdfTaskHelper.resolve(true);

    const coreDocState = this.getCoreDocument(docId);
    const doc = coreDocState?.document;
    if (!doc)
      return PdfTaskHelper.reject({ code: PdfErrorCode.NotFound, message: 'Document not found' });

    const contexts = this.pendingContexts.get(docId);
    if (!contexts) return PdfTaskHelper.resolve(true);

    const creations: Task<any, PdfErrorReason>[] = [];
    const updates: Task<any, PdfErrorReason>[] = [];
    const deletions: { ta: TrackedAnnotation; uid: string }[] = [];

    // 1. Group all pending changes by operation type
    for (const [uid, ta] of Object.entries(docState.byUid)) {
      if (ta.commitState === 'synced') continue;

      const page = doc.pages.find((p) => p.index === ta.object.pageIndex);
      if (!page) continue;

      switch (ta.commitState) {
        case 'new':
          const ctx = contexts.get(ta.object.id) as AnnotationCreateContext<typeof ta.object>;
          const task = this.engine.createPageAnnotation!(doc, page, ta.object, ctx);
          task.wait(() => {
            this.events$.emit({
              type: 'create',
              documentId: docId,
              annotation: ta.object,
              pageIndex: ta.object.pageIndex,
              ctx,
              committed: true,
            });
            contexts.delete(ta.object.id);
          }, ignore);
          creations.push(task);
          break;
        case 'dirty':
          const updateTask = this.engine.updatePageAnnotation!(doc, page, ta.object);
          updateTask.wait(() => {
            this.events$.emit({
              type: 'update',
              documentId: docId,
              annotation: ta.object,
              pageIndex: ta.object.pageIndex,
              patch: ta.object,
              committed: true,
            });
          }, ignore);
          updates.push(updateTask);
          break;
        case 'deleted':
          deletions.push({ ta, uid });
          break;
      }
    }

    // 2. Create deletion tasks
    const deletionTasks: Task<any, PdfErrorReason>[] = [];
    for (const { ta, uid } of deletions) {
      const page = doc.pages.find((p) => p.index === ta.object.pageIndex)!;
      // Only delete if it was previously synced (i.e., exists in the PDF)
      if (ta.commitState === 'deleted' && ta.object.id) {
        const task = new Task<any, PdfErrorReason>();
        const removeTask = this.engine.removePageAnnotation!(doc, page, ta.object);
        removeTask.wait(() => {
          this.dispatch(purgeAnnotation(docId, uid));
          this.events$.emit({
            type: 'delete',
            documentId: docId,
            annotation: ta.object,
            pageIndex: ta.object.pageIndex,
            committed: true,
          });
          task.resolve(true);
        }, task.fail);
        deletionTasks.push(task);
      } else {
        // If it was never synced, just remove from state
        this.dispatch(purgeAnnotation(docId, uid));
      }
    }

    // 3. Chain the operations: creations/updates -> deletions -> finalize
    const allWriteTasks = [...creations, ...updates, ...deletionTasks];

    Task.allSettled(allWriteTasks).wait(() => {
      // 4. Finalize the commit by updating the commitState of all items.
      this.dispatch(commitPendingChanges(docId));
      task.resolve(true);
    }, task.fail);

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
