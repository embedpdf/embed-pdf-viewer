import { BasePlugin, createBehaviorEmitter, PluginRegistry, SET_DOCUMENT } from '@embedpdf/core';
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
} from './actions';
import {
  InteractionManagerCapability,
  InteractionManagerPlugin,
} from '@embedpdf/plugin-interaction-manager';
import { SelectionPlugin, SelectionCapability } from '@embedpdf/plugin-selection';
import { HistoryPlugin, HistoryCapability, Command } from '@embedpdf/plugin-history';
import { getSelectedAnnotation } from './selectors';
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
  private readonly state$ = createBehaviorEmitter<AnnotationState>();
  private readonly interactionManager: InteractionManagerCapability | null;
  private readonly selection: SelectionCapability | null;
  private readonly history: HistoryCapability | null;

  private pendingContexts = new Map<string, unknown>();
  private handlerFactories = new Map<PdfAnnotationSubtype, HandlerFactory<any>>();
  private readonly activeTool$ = createBehaviorEmitter<AnnotationTool | null>(null);
  private readonly events$ = createBehaviorEmitter<AnnotationEvent>();
  private readonly patchRegistry = new PatchRegistry();

  private isInitialLoadComplete = false;
  private importQueue: ImportAnnotationItem<PdfAnnotationObject>[] = [];

  constructor(id: string, registry: PluginRegistry, config: AnnotationPluginConfig) {
    super(id, registry);
    this.config = config;

    this.selection = registry.getPlugin<SelectionPlugin>('selection')?.provides() ?? null;
    this.history = registry.getPlugin<HistoryPlugin>('history')?.provides() ?? null;
    this.interactionManager =
      registry.getPlugin<InteractionManagerPlugin>('interaction-manager')?.provides() ?? null;

    this.coreStore.onAction(SET_DOCUMENT, (_, state) => {
      const doc = state.core.document;
      this.isInitialLoadComplete = false;
      if (doc) this.getAllAnnotations(doc);
    });

    this.registerHandlerFactories();
    this.registerBuiltInPatches();
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

    this.history?.onHistoryChange((topic) => {
      if (topic === this.ANNOTATION_HISTORY_TOPIC && this.config.autoCommit !== false) {
        this.commit();
      }
    });

    this.interactionManager?.onModeChange((s) => {
      const newToolId =
        this.state.tools.find((t) => (t.interaction.mode ?? t.id) === s.activeMode)?.id ?? null;
      if (newToolId !== this.state.activeToolId) {
        this.dispatch(setActiveToolId(newToolId));
      }
    });

    this.selection?.onEndSelection(() => {
      const activeTool = this.getActiveTool();
      if (!activeTool || !activeTool.interaction.textSelection) return;

      const formattedSelection = this.selection?.getFormattedSelection();
      const selectionText = this.selection?.getSelectedText();

      if (!formattedSelection || !selectionText) return;

      for (const selection of formattedSelection) {
        selectionText.wait((text) => {
          const annotationId = uuidV4();
          // Create an annotation using the defaults from the active text tool
          this.createAnnotation(selection.pageIndex, {
            ...activeTool.defaults,
            rect: selection.rect,
            segmentRects: selection.segmentRects,
            pageIndex: selection.pageIndex,
            created: new Date(),
            id: annotationId,
            custom: {
              text: text.join('\n'),
            },
          } as PdfAnnotationObject);

          if (this.getToolBehavior(activeTool, 'deactivateToolAfterCreate')) {
            this.setActiveTool(null);
          }
          if (this.getToolBehavior(activeTool, 'selectAfterCreate')) {
            this.selectAnnotation(selection.pageIndex, annotationId);
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
    if (tool.interaction.textSelection) {
      this.selection?.enableForMode(tool.interaction.mode ?? tool.id);
    }
  }

  protected buildCapability(): AnnotationCapability {
    return {
      getPageAnnotations: (options) => this.getPageAnnotations(options),
      getSelectedAnnotation: () => getSelectedAnnotation(this.state),
      selectAnnotation: (pageIndex, id) => this.selectAnnotation(pageIndex, id),
      deselectAnnotation: () => this.dispatch(deselectAnnotation()),
      getActiveTool: () => this.getActiveTool(),
      setActiveTool: (toolId) => this.setActiveTool(toolId),
      getTools: () => this.state.tools,
      getTool: (toolId) => this.getTool(toolId),
      addTool: (tool) => {
        this.dispatch(addTool(tool));
        this.registerInteractionForTool(tool);
      },
      transformAnnotation: (annotation, options) => this.transformAnnotation(annotation, options),
      registerPatchFunction: (type, patchFn) => this.registerPatchFunction(type, patchFn),
      findToolForAnnotation: (anno) => this.findToolForAnnotation(anno),
      setToolDefaults: (toolId, patch) => this.dispatch(setToolDefaults(toolId, patch)),
      getColorPresets: () => [...this.state.colorPresets],
      addColorPreset: (color) => this.dispatch(addColorPreset(color)),
      importAnnotations: (items) => this.importAnnotations(items),
      createAnnotation: (pageIndex, anno, ctx) => this.createAnnotation(pageIndex, anno, ctx),
      updateAnnotation: (pageIndex, id, patch) => this.updateAnnotation(pageIndex, id, patch),
      deleteAnnotation: (pageIndex, id) => this.deleteAnnotation(pageIndex, id),
      renderAnnotation: (options) => this.renderAnnotation(options),
      onStateChange: this.state$.on,
      onActiveToolChange: this.activeTool$.on,
      onAnnotationEvent: this.events$.on,
      commit: () => this.commit(),
    };
  }

  override onStoreUpdated(prev: AnnotationState, next: AnnotationState): void {
    this.state$.emit(next);

    // If the active tool ID changes, or the tools array itself changes, emit the new active tool
    if (prev.activeToolId !== next.activeToolId || prev.tools !== next.tools) {
      this.activeTool$.emit(this.getActiveTool());
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
    pageIndex: number,
    scale: number,
    callbacks: {
      services: HandlerServices;
      onPreview: (toolId: string, state: AnyPreviewState | null) => void;
    },
  ) {
    const page = this.coreState.core.document?.pages[pageIndex];
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
          this.createAnnotation(pageIndex, annotation, ctx);
          if (this.getToolBehavior(tool, 'deactivateToolAfterCreate')) {
            this.setActiveTool(null);
          }
          if (this.getToolBehavior(tool, 'selectAfterCreate')) {
            this.selectAnnotation(pageIndex, annotation.id);
          }
        },
        getTool: () => this.state.tools.find((t) => t.id === tool.id),
      };

      const unregister = this.interactionManager.registerHandlers({
        modeId: tool.interaction.mode ?? tool.id,
        handlers: factory.create(context),
        pageIndex,
      });

      unregisterFns.push(unregister);
    }

    return () => unregisterFns.forEach((fn) => fn());
  }

  private getAllAnnotations(doc: PdfDocumentObject) {
    const task = this.engine.getAllAnnotations(doc);
    task.wait((annotations) => {
      this.dispatch(setAnnotations(annotations));

      // Mark initial load as complete
      this.isInitialLoadComplete = true;

      // Process any queued imports
      if (this.importQueue.length > 0) {
        this.processImportQueue();
      }

      this.events$.emit({
        type: 'loaded',
        total: Object.values(annotations).reduce(
          (sum, pageAnnotations) => sum + pageAnnotations.length,
          0,
        ),
      });
    }, ignore);
  }

  private getPageAnnotations(
    options: GetPageAnnotationsOptions,
  ): Task<PdfAnnotationObject[], PdfErrorReason> {
    const { pageIndex } = options;

    const doc = this.coreState.core.document;

    if (!doc) {
      return PdfTaskHelper.reject({ code: PdfErrorCode.NotFound, message: 'Document not found' });
    }

    const page = doc.pages.find((p) => p.index === pageIndex);

    if (!page) {
      return PdfTaskHelper.reject({ code: PdfErrorCode.NotFound, message: 'Page not found' });
    }

    return this.engine.getPageAnnotations(doc, page);
  }

  private renderAnnotation({ pageIndex, annotation, options }: RenderAnnotationOptions) {
    const coreState = this.coreState.core;

    if (!coreState.document) {
      return PdfTaskHelper.reject({ code: PdfErrorCode.NotFound, message: 'Document not found' });
    }

    const page = coreState.document.pages.find((page) => page.index === pageIndex);
    if (!page) {
      return PdfTaskHelper.reject({ code: PdfErrorCode.NotFound, message: 'Page not found' });
    }

    return this.engine.renderPageAnnotation(coreState.document, page, annotation, options);
  }

  private importAnnotations(items: ImportAnnotationItem<PdfAnnotationObject>[]) {
    // If initial load hasn't completed, queue the items
    if (!this.isInitialLoadComplete) {
      this.importQueue.push(...items);
      return;
    }

    // Otherwise, import immediately
    this.processImportItems(items);
  }

  private processImportQueue() {
    if (this.importQueue.length === 0) return;

    const items = [...this.importQueue];
    this.importQueue = []; // Clear the queue
    this.processImportItems(items);
  }

  private processImportItems(items: ImportAnnotationItem<PdfAnnotationObject>[]) {
    for (const item of items) {
      const { annotation, ctx } = item;
      const pageIndex = annotation.pageIndex;
      const id = annotation.id;

      this.dispatch(createAnnotation(pageIndex, annotation));
      if (ctx) this.pendingContexts.set(id, ctx);
    }

    if (this.config.autoCommit !== false) this.commit();
  }

  private createAnnotation<A extends PdfAnnotationObject>(
    pageIndex: number,
    annotation: A,
    ctx?: AnnotationCreateContext<A>,
  ) {
    const id = annotation.id;
    const newAnnotation = {
      ...annotation,
      author: annotation.author ?? this.config.annotationAuthor,
    };
    const execute = () => {
      this.dispatch(createAnnotation(pageIndex, newAnnotation));
      if (ctx) this.pendingContexts.set(id, ctx);
      this.events$.emit({
        type: 'create',
        annotation: newAnnotation,
        pageIndex,
        ctx,
        committed: false,
      });
    };

    if (!this.history) {
      execute();
      if (this.config.autoCommit) this.commit();
      return;
    }
    const command: Command = {
      execute,
      undo: () => {
        this.pendingContexts.delete(id);
        this.dispatch(deselectAnnotation());
        this.dispatch(deleteAnnotation(pageIndex, id));
        this.events$.emit({
          type: 'delete',
          annotation: newAnnotation,
          pageIndex,
          committed: false,
        });
      },
    };
    this.history.register(command, this.ANNOTATION_HISTORY_TOPIC);
  }

  private buildPatch(original: PdfAnnotationObject, patch: Partial<PdfAnnotationObject>) {
    if ('rect' in patch) return patch;

    return this.transformAnnotation(original, {
      type: 'property-update',
      changes: patch,
    });
  }

  private updateAnnotation(pageIndex: number, id: string, patch: Partial<PdfAnnotationObject>) {
    const originalObject = this.state.byUid[id].object;
    const finalPatch = this.buildPatch(originalObject, {
      ...patch,
      author: patch.author ?? this.config.annotationAuthor,
    });

    const execute = () => {
      this.dispatch(patchAnnotation(pageIndex, id, finalPatch));
      this.events$.emit({
        type: 'update',
        annotation: originalObject,
        pageIndex,
        patch: finalPatch,
        committed: false,
      });
    };

    if (!this.history) {
      execute();
      if (this.config.autoCommit !== false) {
        this.commit();
      }
      return;
    }
    const originalPatch = Object.fromEntries(
      Object.keys(patch).map((key) => [key, originalObject[key as keyof PdfAnnotationObject]]),
    );
    const command: Command = {
      execute,
      undo: () => {
        this.dispatch(patchAnnotation(pageIndex, id, originalPatch));
        this.events$.emit({
          type: 'update',
          annotation: originalObject,
          pageIndex,
          patch: originalPatch,
          committed: false,
        });
      },
    };
    this.history.register(command, this.ANNOTATION_HISTORY_TOPIC);
  }

  private deleteAnnotation(pageIndex: number, id: string) {
    const originalAnnotation = this.state.byUid[id]?.object;
    if (!originalAnnotation) return;

    const execute = () => {
      this.dispatch(deselectAnnotation());
      this.dispatch(deleteAnnotation(pageIndex, id));
      this.events$.emit({
        type: 'delete',
        annotation: originalAnnotation,
        pageIndex,
        committed: false,
      });
    };

    if (!this.history) {
      execute();
      if (this.config.autoCommit !== false) this.commit();
      return;
    }
    const command: Command = {
      execute,
      undo: () => {
        this.dispatch(createAnnotation(pageIndex, originalAnnotation));
        this.events$.emit({
          type: 'create',
          annotation: originalAnnotation,
          pageIndex,
          committed: false,
        });
      },
    };
    this.history.register(command, this.ANNOTATION_HISTORY_TOPIC);
  }

  private selectAnnotation(pageIndex: number, id: string) {
    this.dispatch(selectAnnotation(pageIndex, id));
  }

  public getActiveTool(): AnnotationTool | null {
    if (!this.state.activeToolId) return null;
    return this.state.tools.find((t) => t.id === this.state.activeToolId) ?? null;
  }

  public setActiveTool(toolId: string | null): void {
    if (toolId === this.state.activeToolId) return;
    const tool = this.state.tools.find((t) => t.id === toolId);
    if (tool) {
      this.interactionManager?.activate(tool.interaction.mode ?? tool.id);
    } else {
      this.interactionManager?.activateDefaultMode();
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

  private commit(): Task<boolean, PdfErrorReason> {
    const task = new Task<boolean, PdfErrorReason>();

    if (!this.state.hasPendingChanges) return PdfTaskHelper.resolve(true);

    const doc = this.coreState.core.document;
    if (!doc)
      return PdfTaskHelper.reject({ code: PdfErrorCode.NotFound, message: 'Document not found' });

    const creations: Task<any, PdfErrorReason>[] = [];
    const updates: Task<any, PdfErrorReason>[] = [];
    const deletions: { ta: TrackedAnnotation; uid: string }[] = [];

    // 1. Group all pending changes by operation type
    for (const [uid, ta] of Object.entries(this.state.byUid)) {
      if (ta.commitState === 'synced') continue;

      const page = doc.pages.find((p) => p.index === ta.object.pageIndex);
      if (!page) continue;

      switch (ta.commitState) {
        case 'new':
          const ctx = this.pendingContexts.get(ta.object.id) as AnnotationCreateContext<
            typeof ta.object
          >;
          const task = this.engine.createPageAnnotation!(doc, page, ta.object, ctx);
          task.wait(() => {
            this.events$.emit({
              type: 'create',
              annotation: ta.object,
              pageIndex: ta.object.pageIndex,
              ctx,
              committed: true,
            });
            this.pendingContexts.delete(ta.object.id);
          }, ignore);
          creations.push(task);
          break;
        case 'dirty':
          const updateTask = this.engine.updatePageAnnotation!(doc, page, ta.object);
          updateTask.wait(() => {
            this.events$.emit({
              type: 'update',
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
          this.dispatch(purgeAnnotation(uid));
          this.events$.emit({
            type: 'delete',
            annotation: ta.object,
            pageIndex: ta.object.pageIndex,
            committed: true,
          });
          task.resolve(true);
        }, task.fail);
        deletionTasks.push(task);
      } else {
        // If it was never synced, just remove from state
        this.dispatch(purgeAnnotation(uid));
      }
    }

    // 3. Chain the operations: creations/updates -> deletions -> finalize
    const allWriteTasks = [...creations, ...updates, ...deletionTasks];

    Task.allSettled(allWriteTasks).wait(() => {
      // 4. Finalize the commit by updating the commitState of all items.
      this.dispatch(commitPendingChanges());
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
