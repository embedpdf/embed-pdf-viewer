import {
  BasePlugin,
  createBehaviorEmitter,
  enumEntries,
  PluginRegistry,
  SET_DOCUMENT,
} from '@embedpdf/core';
import {
  ignore,
  PdfAnnotationObject,
  PdfDocumentObject,
  PdfEngine,
  PdfErrorReason,
  Task,
  PdfAnnotationSubtype,
  PdfTaskHelper,
  PdfErrorCode,
  PdfTask,
  Rotation,
  AppearanceMode,
  PdfBlendMode,
} from '@embedpdf/models';
import {
  ActiveTool,
  AnnotationCapability,
  AnnotationPluginConfig,
  AnnotationState,
  BaseAnnotationDefaults,
  GetPageAnnotationsOptions,
  RenderAnnotationOptions,
  TextMarkupSubtype,
  ToolDefaultsByMode,
  TrackedAnnotation,
} from './types';
import {
  setAnnotations,
  selectAnnotation,
  deselectAnnotation,
  setAnnotationMode,
  AnnotationAction,
  updateToolDefaults,
  addColorPreset,
  createAnnotation,
  patchAnnotation,
  deleteAnnotation,
  commitPendingChanges,
  storePdfId,
  purgeAnnotation,
  reindexPageAnnotations,
  setActiveVariant,
} from './actions';
import {
  InteractionManagerCapability,
  InteractionManagerPlugin,
  InteractionMode,
} from '@embedpdf/plugin-interaction-manager';
import { SelectionPlugin, SelectionCapability } from '@embedpdf/plugin-selection';
import { HistoryPlugin, HistoryCapability, Command } from '@embedpdf/plugin-history';
import { getSelectedAnnotation } from './selectors';
import { makeUid, parseUid } from './utils';
import { makeVariantKey } from './variant-key';

export class AnnotationPlugin extends BasePlugin<
  AnnotationPluginConfig,
  AnnotationCapability,
  AnnotationState,
  AnnotationAction
> {
  static readonly id = 'annotation' as const;

  private readonly ANNOTATION_HISTORY_TOPIC = 'annotations';

  private readonly config: AnnotationPluginConfig;

  private engine: PdfEngine;
  private readonly state$ = createBehaviorEmitter<AnnotationState>();
  private readonly interactionManager: InteractionManagerCapability | null;
  private readonly selection: SelectionCapability | null;
  private readonly history: HistoryCapability | null;

  private readonly modeByVariant = new Map<string, string>();
  private readonly variantByMode = new Map<string, string>();

  private readonly activeVariantChange$ = createBehaviorEmitter<string | null>();
  private readonly activeTool$ = createBehaviorEmitter<ActiveTool>({
    variantKey: null,
    defaults: null,
  });

  constructor(
    id: string,
    registry: PluginRegistry,
    engine: PdfEngine,
    config: AnnotationPluginConfig,
  ) {
    super(id, registry);
    this.engine = engine;
    this.config = config;

    const selection = registry.getPlugin<SelectionPlugin>('selection');
    this.selection = selection?.provides() ?? null;

    const history = registry.getPlugin<HistoryPlugin>('history');
    this.history = history?.provides() ?? null;

    const interactionManager = registry.getPlugin<InteractionManagerPlugin>('interaction-manager');
    this.interactionManager = interactionManager?.provides() ?? null;

    this.coreStore.onAction(SET_DOCUMENT, (_action, state) => {
      const doc = state.core.document;
      if (doc) {
        this.getAllAnnotations(doc);
      }
    });
  }

  async initialize(): Promise<void> {
    for (const [variantKey, defaults] of Object.entries(this.state.toolDefaults)) {
      this.registerTool(variantKey, defaults);
    }

    this.history?.onHistoryChange((topic) => {
      if (topic === this.ANNOTATION_HISTORY_TOPIC && this.config.autoCommit !== false) {
        this.commit();
      }
    });

    this.interactionManager?.onModeChange((s) => {
      const newVariant = this.variantByMode.get(s.activeMode) ?? null;
      console.log(newVariant, this.state.activeVariant);
      if (newVariant !== this.state.activeVariant) {
        this.dispatch(setActiveVariant(newVariant));
        this.activeVariantChange$.emit(newVariant);
      }
    });

    this.selection?.onEndSelection(() => {
      if (!this.state.activeVariant) return;

      if (
        !(
          this.state.activeVariant === makeVariantKey(PdfAnnotationSubtype.HIGHLIGHT) ||
          this.state.activeVariant === makeVariantKey(PdfAnnotationSubtype.UNDERLINE) ||
          this.state.activeVariant === makeVariantKey(PdfAnnotationSubtype.STRIKEOUT) ||
          this.state.activeVariant === makeVariantKey(PdfAnnotationSubtype.SQUIGGLY)
        )
      ) {
        return;
      }

      const formattedSelection = this.selection?.getFormattedSelection();
      if (!formattedSelection) return;

      for (const selection of formattedSelection) {
        const rect = selection.rect;
        const segmentRects = selection.segmentRects;
        const type = this.state.activeVariant;
        const subtype = this.state.toolDefaults[type].subtype;
        const color = this.state.toolDefaults[type].color;
        const opacity = this.state.toolDefaults[type].opacity;
        const blendMode = this.state.toolDefaults[type].blendMode ?? PdfBlendMode.Normal;

        this.createAnnotation(selection.pageIndex, {
          type: subtype as TextMarkupSubtype,
          rect,
          segmentRects,
          color,
          opacity,
          blendMode,
          pageIndex: selection.pageIndex,
          id: Date.now() + Math.random(),
        });
      }

      this.selection?.clear();
    });
  }

  private registerTool(variantKey: string, defaults: BaseAnnotationDefaults) {
    const modeId = defaults.interaction.mode;
    const interactionMode: InteractionMode = {
      id: modeId,
      scope: 'page',
      exclusive: defaults.interaction.exclusive,
      cursor: defaults.interaction.cursor,
    };

    this.interactionManager?.registerMode(interactionMode);

    if (defaults.textSelection) {
      this.selection?.enableForMode(modeId);
    }

    this.modeByVariant.set(variantKey, modeId);
    this.variantByMode.set(modeId, variantKey);
  }

  protected buildCapability(): AnnotationCapability {
    return {
      getPageAnnotations: (options: GetPageAnnotationsOptions) => {
        return this.getPageAnnotations(options);
      },
      getSelectedAnnotation: () => {
        return getSelectedAnnotation(this.state);
      },
      selectAnnotation: (pageIndex: number, annotationId: number) => {
        this.selectAnnotation(pageIndex, annotationId);
      },
      deselectAnnotation: () => {
        this.dispatch(deselectAnnotation());
      },
      getActiveVariant: () => {
        return this.state.activeVariant;
      },
      setActiveVariant: (variantKey: string | null) => {
        if (variantKey === this.state.activeVariant) return;
        if (variantKey) {
          const mode = this.modeByVariant.get(variantKey);
          if (!mode) throw new Error(`Mode missing for variant ${variantKey}`);
          this.interactionManager?.activate(mode);
        } else {
          this.interactionManager?.activate('default');
        }
      },
      getToolDefaults: (variantKey) => {
        const defaults = this.state.toolDefaults[variantKey];
        if (!defaults) {
          throw new Error(`No defaults found for variant: ${variantKey}`);
        }
        return defaults;
      },
      getToolDefaultsBySubtypeAndIntent: (subtype, intent) => {
        const variantKey = makeVariantKey(subtype, intent);
        const defaults = this.state.toolDefaults[variantKey];
        if (!defaults) {
          throw new Error(`No defaults found for variant: ${variantKey}`);
        }
        return defaults;
      },
      getToolDefaultsBySubtype: (subtype) => {
        const defaults = this.state.toolDefaults[subtype];
        if (!defaults) {
          throw new Error(`No defaults found for subtype: ${subtype}`);
        }
        return defaults;
      },
      setToolDefaults: (variantKey, patch) => {
        this.dispatch(updateToolDefaults(variantKey, patch));
      },
      getColorPresets: () => [...this.state.colorPresets],
      addColorPreset: (color) => this.dispatch(addColorPreset(color)),
      createAnnotation: (pageIndex: number, annotation: PdfAnnotationObject) =>
        this.createAnnotation(pageIndex, annotation),
      updateAnnotation: (pageIndex: number, localId: number, patch: Partial<PdfAnnotationObject>) =>
        this.updateAnnotation(pageIndex, localId, patch),
      deleteAnnotation: (pageIndex: number, localId: number) =>
        this.deleteAnnotation(pageIndex, localId),
      renderAnnotation: (options: RenderAnnotationOptions) => this.renderAnnotation(options),
      onStateChange: this.state$.on,
      onActiveVariantChange: this.activeVariantChange$.on,
      onActiveToolChange: this.activeTool$.on,
      commit: () => this.commit(),
    };
  }

  private createActiveTool(mode: string | null, toolDefaults: ToolDefaultsByMode): ActiveTool {
    if (mode === null) {
      return { variantKey: null, defaults: null };
    }
    return { variantKey: mode, defaults: toolDefaults[mode] } as ActiveTool;
  }

  private emitActiveTool(state: AnnotationState) {
    const activeTool = this.createActiveTool(state.activeVariant, state.toolDefaults);
    this.activeTool$.emit(activeTool);
  }

  override onStoreUpdated(prev: AnnotationState, next: AnnotationState): void {
    this.state$.emit(next);
    if (
      prev.activeVariant !== next.activeVariant ||
      prev.toolDefaults[prev.activeVariant ?? PdfAnnotationSubtype.HIGHLIGHT] !==
        next.toolDefaults[next.activeVariant ?? PdfAnnotationSubtype.HIGHLIGHT]
    ) {
      this.emitActiveTool(next);
    }
  }

  private getAllAnnotations(doc: PdfDocumentObject) {
    const task = this.engine.getAllAnnotations(doc);
    task.wait((annotations) => this.dispatch(setAnnotations(annotations)), ignore);
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

  private renderAnnotation({
    pageIndex,
    annotation,
    scaleFactor = 1,
    rotation = Rotation.Degree0,
    dpr = 1,
    mode = AppearanceMode.Normal,
    imageType = 'image/webp',
  }: RenderAnnotationOptions) {
    const coreState = this.coreState.core;

    if (!coreState.document) {
      throw new Error('document does not open');
    }

    const page = coreState.document.pages.find((page) => page.index === pageIndex);
    if (!page) {
      throw new Error('page does not exist');
    }

    return this.engine.renderAnnotation(
      coreState.document,
      page,
      annotation,
      scaleFactor,
      rotation,
      dpr,
      mode,
      imageType,
    );
  }

  private selectAnnotation(pageIndex: number, annotationId: number) {
    this.dispatch(selectAnnotation(pageIndex, annotationId));
  }

  private createAnnotation(pageIndex: number, annotation: PdfAnnotationObject) {
    const localId = annotation.id;
    const execute = () => this.dispatch(createAnnotation(pageIndex, localId, annotation));

    if (!this.history) {
      execute();
      if (this.config.autoCommit) this.commit();
      return;
    }
    const command: Command = {
      execute,
      undo: () => {
        this.dispatch(deselectAnnotation());
        this.dispatch(deleteAnnotation(pageIndex, localId));
      },
    };
    this.history.register(command, this.ANNOTATION_HISTORY_TOPIC);
  }

  private updateAnnotation(
    pageIndex: number,
    localId: number,
    patch: Partial<PdfAnnotationObject>,
  ) {
    if (!this.history) {
      this.dispatch(patchAnnotation(pageIndex, localId, patch));
      if (this.config.autoCommit !== false) {
        this.commit();
      }
      return;
    }
    const originalObject = this.state.byUid[makeUid(pageIndex, localId)].object;
    const originalPatch = Object.fromEntries(
      Object.keys(patch).map((key) => [key, originalObject[key as keyof PdfAnnotationObject]]),
    );
    const command: Command = {
      execute: () => this.dispatch(patchAnnotation(pageIndex, localId, patch)),
      undo: () => this.dispatch(patchAnnotation(pageIndex, localId, originalPatch)),
    };
    this.history.register(command, this.ANNOTATION_HISTORY_TOPIC);
  }

  private deleteAnnotation(pageIndex: number, localId: number) {
    if (!this.history) {
      this.dispatch(deselectAnnotation());
      this.dispatch(deleteAnnotation(pageIndex, localId));
      if (this.config.autoCommit !== false) {
        this.commit();
      }
      return;
    }
    const originalAnnotation = this.state.byUid[makeUid(pageIndex, localId)].object;
    const command: Command = {
      execute: () => {
        this.dispatch(deselectAnnotation());
        this.dispatch(deleteAnnotation(pageIndex, localId));
      },
      undo: () => this.dispatch(createAnnotation(pageIndex, localId, originalAnnotation)),
    };
    this.history.register(command, this.ANNOTATION_HISTORY_TOPIC);
  }

  private commit(): Task<boolean, PdfErrorReason> {
    const task = new Task<boolean, PdfErrorReason>();

    if (!this.state.hasPendingChanges) return PdfTaskHelper.resolve(true);

    const doc = this.coreState.core.document;
    if (!doc)
      return PdfTaskHelper.reject({ code: PdfErrorCode.NotFound, message: 'Document not found' });

    const creations: Task<any, PdfErrorReason>[] = [];
    const updates: Task<any, PdfErrorReason>[] = [];
    const deletionsByPage = new Map<number, { ta: TrackedAnnotation; uid: string }[]>();
    const affectedPages = new Set<number>();

    // 1. Group all pending changes by operation type
    for (const [uid, ta] of Object.entries(this.state.byUid)) {
      if (ta.commitState === 'synced') continue;

      const { pageIndex } = parseUid(uid);
      const page = doc.pages.find((p) => p.index === pageIndex);
      if (!page) continue;

      affectedPages.add(pageIndex);

      switch (ta.commitState) {
        case 'new':
          const task = this.engine.createPageAnnotation!(doc, page, ta.object);
          task.wait((annoId) => this.dispatch(storePdfId(uid, annoId)), ignore);
          creations.push(task);
          break;
        case 'dirty':
          updates.push(
            this.engine.updatePageAnnotation!(doc, page, { ...ta.object, id: ta.pdfId! }),
          );
          break;
        case 'deleted':
          if (!deletionsByPage.has(pageIndex)) {
            deletionsByPage.set(pageIndex, []);
          }
          deletionsByPage.get(pageIndex)!.push({ ta, uid });
          break;
      }
    }

    // 2. Create deletion tasks, sorted by ID descending
    const deletionTasks: Task<any, PdfErrorReason>[] = [];
    for (const [pageIndex, deletions] of deletionsByPage.entries()) {
      const page = doc.pages.find((p) => p.index === pageIndex)!;

      deletions.sort((a, b) => (b.ta.pdfId ?? -1) - (a.ta.pdfId ?? -1));

      for (const { ta, uid } of deletions) {
        if (ta.pdfId !== undefined) {
          const task = new Task<any, PdfErrorReason>();
          const removeTask = this.engine.removePageAnnotation!(doc, page, {
            ...ta.object,
            id: ta.pdfId!,
          });
          removeTask.wait(() => {
            this.dispatch(purgeAnnotation(uid));
            task.resolve(true);
          }, task.fail);
          deletionTasks.push(task);
        } else {
          this.dispatch(purgeAnnotation(uid));
        }
      }
    }

    // 3. Chain the operations: creations/updates -> deletions -> re-sync
    const allWriteTasks = [...creations, ...updates, ...deletionTasks];

    Task.allSettled(allWriteTasks).wait(() => {
      // 4. Client-Side Re-indexing
      // After all engine operations are done, tell the reducer to re-index each affected page.
      for (const pageIndex of affectedPages) {
        this.dispatch(reindexPageAnnotations(pageIndex));
      }

      // 5. Finalize the commit by updating the commitState of all items.
      this.dispatch(commitPendingChanges());
      task.resolve(true);
    }, task.fail);

    return task;
  }
}
