import {
  BasePlugin,
  PluginRegistry,
  createScopedEmitter,
  createEmitter,
  Listener,
} from '@embedpdf/core';
import {
  Task,
  TaskStage,
  TaskSequence,
  Size,
  Rect,
  PdfPageTextRuns,
  uuidV4,
} from '@embedpdf/models';
import {
  LayoutDetectionPipeline,
  TableStructurePipeline,
  LayoutDetectionInput,
  TableStructureInput,
  PipelineProgress,
} from '@embedpdf/ai';
import { AiManagerPlugin, AiManagerCapability } from '@embedpdf/plugin-ai-manager';
import { RenderCapability, RenderPlugin } from '@embedpdf/plugin-render';

import {
  LayoutAnalysisPluginConfig,
  LayoutAnalysisCapability,
  LayoutAnalysisState,
  LayoutAnalysisScope,
  PageLayout,
  DocumentLayout,
  LayoutTask,
  PageAnalysisProgress,
  DocumentAnalysisProgress,
  LayoutAnalysisErrorReason,
  TableStructureElement,
  PageLayoutChangeEvent,
  PageLayoutChangeGlobalEvent,
  StateChangeEvent,
  AnalyzePageOptions,
} from './types';
import {
  LayoutAnalysisAction,
  initLayoutState,
  cleanupLayoutState,
  setPageStatus,
  setPageLayout,
  setPageError,
  setLayoutOverlayVisible,
  setTableStructureOverlayVisible,
  setTableStructureEnabled,
  setLayoutThreshold,
  setTableStructureThreshold,
  selectBlock,
  setPageTableStructures,
  clearPageResults,
  clearAllResults,
} from './actions';
import {
  mapDetectionsToPageCoordinates,
  mapTableElementToPageCoordinates,
} from './coordinate-mapper';

const TABLE_CLASS_ID = 21;
const TABLE_MIN_SCORE = 0.1;

export class LayoutAnalysisPlugin extends BasePlugin<
  LayoutAnalysisPluginConfig,
  LayoutAnalysisCapability,
  LayoutAnalysisState,
  LayoutAnalysisAction
> {
  static readonly id = 'layout-analysis' as const;

  private pluginConfig!: Required<LayoutAnalysisPluginConfig>;
  private aiManager: AiManagerCapability;
  private renderCapability: RenderCapability;

  private readonly layoutPipeline = new LayoutDetectionPipeline();
  private readonly tablePipeline = new TableStructurePipeline();

  private readonly pageLayoutChange$ = createScopedEmitter<
    PageLayoutChangeEvent,
    PageLayoutChangeGlobalEvent,
    string
  >((documentId, data) => ({ documentId, ...data }));

  private readonly stateChange$ = createEmitter<StateChangeEvent>();

  private readonly activeTasks = new Map<string, Task<any, any, any>>();

  constructor(id: string, registry: PluginRegistry, config: LayoutAnalysisPluginConfig) {
    super(id, registry);
    this.aiManager = this.registry.getPlugin<AiManagerPlugin>('ai-manager')!.provides();
    this.renderCapability = this.registry.getPlugin<RenderPlugin>('render')!.provides();
  }

  async initialize(config: LayoutAnalysisPluginConfig): Promise<void> {
    this.pluginConfig = {
      layoutThreshold: 0.35,
      tableStructureThreshold: 0.8,
      tableStructure: false,
      autoAnalyze: false,
      renderScale: 2.0,
      ...config,
    };

    if (this.pluginConfig.tableStructure) {
      this.dispatch(setTableStructureEnabled(true));
    }
  }

  protected onDocumentLoaded(documentId: string): void {
    this.dispatch(initLayoutState(documentId));
  }

  protected onDocumentClosed(documentId: string): void {
    this.abortActiveTask(documentId);
    this.dispatch(cleanupLayoutState(documentId));
    this.pageLayoutChange$.clearScope(documentId);
  }

  protected onStoreUpdated(prevState: LayoutAnalysisState, newState: LayoutAnalysisState): void {
    if (prevState === newState) return;

    for (const documentId in newState.documents) {
      const changed =
        prevState.documents[documentId] !== newState.documents[documentId] ||
        prevState.layoutOverlayVisible !== newState.layoutOverlayVisible ||
        prevState.tableStructureOverlayVisible !== newState.tableStructureOverlayVisible ||
        prevState.tableStructureEnabled !== newState.tableStructureEnabled ||
        prevState.layoutThreshold !== newState.layoutThreshold ||
        prevState.tableStructureThreshold !== newState.tableStructureThreshold ||
        prevState.selectedBlockId !== newState.selectedBlockId;

      if (changed) {
        this.stateChange$.emit({ documentId, state: newState });
      }
    }
  }

  protected buildCapability(): LayoutAnalysisCapability {
    return {
      analyzePage: (pageIndex, options) => this.analyzePage(pageIndex, undefined, options),
      analyzeAllPages: (options) => this.analyzeAllPages(undefined, options),
      getPageLayout: (pageIndex) => this.getPageLayout(pageIndex),
      getPageTextRuns: (pageIndex) => this.getPageTextRuns(pageIndex),
      forDocument: (documentId) => this.createScope(documentId),
      onPageLayoutChange: this.pageLayoutChange$.onGlobal,
      onStateChange: this.stateChange$.on,
      setLayoutOverlayVisible: (v) => this.dispatch(setLayoutOverlayVisible(v)),
      setTableStructureOverlayVisible: (v) => this.dispatch(setTableStructureOverlayVisible(v)),
      setTableStructureEnabled: (v) => this.dispatch(setTableStructureEnabled(v)),
      setLayoutThreshold: (t) => this.dispatch(setLayoutThreshold(t)),
      setTableStructureThreshold: (t) => this.dispatch(setTableStructureThreshold(t)),
      selectBlock: (id) => this.dispatch(selectBlock(id)),
      clearPageResults: (docId, pageIndex) => {
        this.dispatch(clearPageResults(docId, pageIndex));
        this.pageLayoutChange$.emit(docId, { pageIndex, layout: null });
      },
      clearAllResults: (docId) => {
        this.dispatch(clearAllResults(docId));
      },
    };
  }

  // ─── Public API ──────────────────────────────────────────

  private analyzePage(
    pageIndex: number,
    documentId?: string,
    options?: AnalyzePageOptions,
  ): LayoutTask<PageLayout, PageAnalysisProgress> {
    const task = new Task<PageLayout, LayoutAnalysisErrorReason, PageAnalysisProgress>();

    const docId = documentId ?? this.getActiveDocumentId();
    if (!docId) {
      task.reject({ type: 'no-document', message: 'No document loaded' });
      return task;
    }

    const pageState = this.getPageState(pageIndex, docId);
    const hasLayout = pageState?.layout != null;
    const hasTableStructure = pageState?.tableStructureAnalyzed ?? false;
    const tableEnabled = this.state.tableStructureEnabled;
    const force = options?.force ?? false;

    const needsLayout = !hasLayout || force;
    const needsTableStructure = tableEnabled && (!hasTableStructure || force);

    if (!needsLayout && !needsTableStructure) {
      task.resolve(pageState!.layout!);
      return task;
    }

    this.dispatch(setPageStatus(docId, pageIndex, 'analyzing'));
    this.doAnalyzePage(docId, pageIndex, task, {
      runLayout: needsLayout,
      runTableStructure: needsTableStructure,
    });

    return task;
  }

  private analyzeAllPages(
    documentId?: string,
    options?: AnalyzePageOptions,
  ): LayoutTask<DocumentLayout, DocumentAnalysisProgress> {
    const task = new Task<DocumentLayout, LayoutAnalysisErrorReason, DocumentAnalysisProgress>();

    const docId = documentId ?? this.getActiveDocumentId();
    if (!docId) {
      task.reject({ type: 'no-document', message: 'No document loaded' });
      return task;
    }

    const coreDoc = this.coreState.core.documents[docId];
    if (!coreDoc?.document) {
      task.reject({ type: 'no-document', message: 'No document loaded' });
      return task;
    }

    this.trackTask(docId, task);

    const pageCount = coreDoc.document.pageCount;
    const pages: PageLayout[] = [];
    let completed = 0;
    let currentPageTask: LayoutTask<PageLayout, PageAnalysisProgress> | null = null;

    const origAbort = task.abort.bind(task);
    task.abort = (reason: any) => {
      currentPageTask?.abort(reason);
      origAbort(reason);
    };

    const analyzeNext = (idx: number) => {
      if (task.state.stage !== TaskStage.Pending) return;

      if (idx >= pageCount) {
        task.resolve({ pages });
        return;
      }

      const pageTask = this.analyzePage(idx, docId, options);
      currentPageTask = pageTask;

      pageTask.onProgress((p) => {
        if (task.state.stage === TaskStage.Pending) {
          task.progress(p);
        }
      });

      pageTask.wait(
        (layout) => {
          if (task.state.stage !== TaskStage.Pending) return;
          pages.push(layout);
          completed++;
          task.progress({ stage: 'page-complete', pageIndex: idx, completed, total: pageCount });
          analyzeNext(idx + 1);
        },
        (err) => {
          if (task.state.stage === TaskStage.Pending) {
            task.fail(err);
          }
        },
      );
    };

    analyzeNext(0);
    return task;
  }

  private getPageLayout(pageIndex: number, documentId?: string): PageLayout | null {
    const docId = documentId ?? this.getActiveDocumentId();
    if (!docId) return null;
    return this.getPageState(pageIndex, docId)?.layout ?? null;
  }

  private getPageState(pageIndex: number, documentId: string) {
    return this.state.documents[documentId]?.pages[pageIndex] ?? null;
  }

  private getPageTextRuns(pageIndex: number, documentId?: string): Task<PdfPageTextRuns, any, any> {
    const task = new Task<PdfPageTextRuns, any, any>();

    const docId = documentId ?? this.getActiveDocumentId();
    if (!docId) {
      task.reject({ type: 'no-document', message: 'No document loaded' });
      return task;
    }

    const coreDoc = this.coreState.core.documents[docId];
    if (!coreDoc?.document) {
      task.reject({ type: 'no-document', message: 'No document loaded' });
      return task;
    }

    const page = coreDoc.document.pages[pageIndex];
    if (!page) {
      task.reject({ type: 'no-document', message: `Page ${pageIndex} not found` });
      return task;
    }

    const engineTask = this.engine.getPageTextRuns(coreDoc.document, page);
    engineTask.wait(
      (result) => task.resolve(result),
      (err) => task.reject(err),
    );

    return task;
  }

  private createScope(documentId: string): LayoutAnalysisScope {
    return {
      analyzePage: (pageIndex, options) => this.analyzePage(pageIndex, documentId, options),
      analyzeAllPages: (options) => this.analyzeAllPages(documentId, options),
      getPageLayout: (pageIndex) => this.getPageLayout(pageIndex, documentId),
      getPageTextRuns: (pageIndex) => this.getPageTextRuns(pageIndex, documentId),
      onPageLayoutChange: this.pageLayoutChange$.forScope(documentId),
      getState: () => this.state,
      onStateChange: (listener: Listener<LayoutAnalysisState>) =>
        this.stateChange$.on((event) => {
          if (event.documentId === documentId) listener(event.state);
        }),
    };
  }

  // ─── Task tracking & abort ────────────────────────────────

  private trackTask(documentId: string, task: Task<any, any, any>): void {
    this.abortActiveTask(documentId);
    this.activeTasks.set(documentId, task);

    const cleanup = () => this.activeTasks.delete(documentId);
    task.wait(cleanup, cleanup);
  }

  private abortActiveTask(documentId: string): void {
    const existing = this.activeTasks.get(documentId);
    if (existing) {
      existing.abort({ type: 'no-document', message: 'Aborted' });
      this.activeTasks.delete(documentId);
    }
  }

  // ─── Internal pipeline ───────────────────────────────────

  private doAnalyzePage(
    documentId: string,
    pageIndex: number,
    task: Task<PageLayout, LayoutAnalysisErrorReason, PageAnalysisProgress>,
    phases: { runLayout: boolean; runTableStructure: boolean },
  ): void {
    const seq = new TaskSequence(task);

    seq.execute(
      async () => {
        const coreDoc = this.coreState.core.documents[documentId];
        if (!coreDoc?.document) {
          task.reject({ type: 'no-document', message: 'No document loaded' });
          return;
        }

        const page = coreDoc.document.pages[pageIndex];
        if (!page) {
          task.reject({ type: 'render-failed', pageIndex, message: `Page ${pageIndex} not found` });
          return;
        }

        const pageSize: Size = page.size;
        const renderScope = this.renderCapability.forDocument(documentId);

        let layout: PageLayout;

        this.logger.debug('LayoutAnalysis', 'analyzePage', `page ${pageIndex}`, {
          runLayout: phases.runLayout,
          runTableStructure: phases.runTableStructure,
        });

        if (phases.runLayout) {
          task.progress({ stage: 'rendering', pageIndex });
          const imageData = await seq.run(() =>
            renderScope.renderPageRaw({
              pageIndex,
              options: { scaleFactor: this.pluginConfig.renderScale },
            }),
          );

          task.progress({ stage: 'layout-detection', pageIndex });
          const input: LayoutDetectionInput = {
            imageData,
            sourceWidth: imageData.width,
            sourceHeight: imageData.height,
          };

          const detections = await seq.runWithProgress(
            () => this.aiManager.run(this.layoutPipeline, input),
            (p: PipelineProgress) => {
              if (p.stage === 'downloading-model') {
                return {
                  stage: 'downloading-model' as const,
                  pageIndex,
                  loaded: p.loaded,
                  total: p.total,
                };
              }
              if (p.stage === 'creating-session') {
                return { stage: 'creating-session' as const, pageIndex };
              }
              return { stage: 'layout-detection' as const, pageIndex };
            },
          );

          task.progress({ stage: 'mapping-coordinates', pageIndex });
          const imageSize: Size = { width: imageData.width, height: imageData.height };
          const blocks = mapDetectionsToPageCoordinates(detections, imageSize, pageSize);
          for (const block of blocks) {
            block.id = uuidV4();
          }

          layout = {
            pageIndex,
            blocks,
            tableStructures: new Map(),
            imageSize,
            pageSize,
          };

          this.logger.debug('LayoutAnalysis', 'layoutDetection', `page ${pageIndex} complete`, {
            blockCount: blocks.length,
          });

          this.dispatch(setPageLayout(documentId, pageIndex, layout));
          this.pageLayoutChange$.emit(documentId, { pageIndex, layout });
        } else {
          layout = this.getPageLayout(pageIndex, documentId)!;
        }

        if (phases.runTableStructure) {
          const tableStructures = await this.runTableStructurePass(
            documentId,
            pageIndex,
            layout,
            seq,
            task,
          );

          layout = { ...layout, tableStructures };
          this.dispatch(setPageTableStructures(documentId, pageIndex, tableStructures));
          this.pageLayoutChange$.emit(documentId, { pageIndex, layout });
        }

        task.resolve(layout);
      },
      (err) => {
        const message = err instanceof Error ? err.message : String(err);
        return { type: 'inference-failed' as const, message };
      },
    );

    task.wait(
      () => {},
      (error) => {
        if (error.type === 'reject') {
          this.dispatch(setPageError(documentId, pageIndex, error.reason.message));
        } else if (error.type === 'abort') {
          this.dispatch(setPageStatus(documentId, pageIndex, 'idle'));
        }
      },
    );
  }

  private async runTableStructurePass(
    documentId: string,
    pageIndex: number,
    layout: PageLayout,
    seq: TaskSequence<LayoutAnalysisErrorReason, PageAnalysisProgress>,
    task: Task<PageLayout, LayoutAnalysisErrorReason, PageAnalysisProgress>,
  ): Promise<Map<string, TableStructureElement[]>> {
    const tableStructures = new Map<string, TableStructureElement[]>();
    const tableBlocks = layout.blocks.filter(
      (b) => b.classId === TABLE_CLASS_ID && b.score >= TABLE_MIN_SCORE,
    );

    this.logger.debug('LayoutAnalysis', 'runTableStructurePass', {
      totalBlocks: layout.blocks.length,
      qualifyingTableBlocks: tableBlocks.length,
      tableBlockScores: tableBlocks.map((b) => b.score),
      tableMinScore: TABLE_MIN_SCORE,
    });

    for (let ti = 0; ti < tableBlocks.length; ti++) {
      task.progress({
        stage: 'table-structure',
        pageIndex,
        tableIndex: ti,
        tableCount: tableBlocks.length,
      });

      try {
        const tableBlock = tableBlocks[ti];
        const elements = await this.analyzeTableStructure(
          tableBlock.rect,
          documentId,
          pageIndex,
          seq,
          ti,
          tableBlocks.length,
        );
        this.logger.debug(
          'LayoutAnalysis',
          'tableStructure',
          `table ${ti} (block ${tableBlock.id})`,
          {
            elementsCount: elements.length,
            tableRect: tableBlock.rect,
            sampleElement: elements.length > 0 ? elements[0] : null,
          },
        );
        tableStructures.set(tableBlock.id, elements);
      } catch {
        tableStructures.set(tableBlocks[ti].id, []);
      }
    }

    return tableStructures;
  }

  private async analyzeTableStructure(
    tableRect: Rect,
    documentId: string,
    pageIndex: number,
    seq: TaskSequence<LayoutAnalysisErrorReason, PageAnalysisProgress>,
    tableIndex: number,
    tableCount: number,
  ): Promise<TableStructureElement[]> {
    if (tableRect.size.width < 1 || tableRect.size.height < 1) return [];

    const renderScope = this.renderCapability.forDocument(documentId);
    const cropData = await seq.run(() =>
      renderScope.renderPageRectRaw({
        pageIndex,
        rect: tableRect,
        options: { scaleFactor: this.pluginConfig.renderScale },
      }),
    );

    const cropSize: Size = { width: cropData.width, height: cropData.height };
    if (cropSize.width < 8 || cropSize.height < 8) return [];

    const input: TableStructureInput = { imageData: cropData };

    const result = await seq.runWithProgress(
      () => this.aiManager.run(this.tablePipeline, input),
      (p: PipelineProgress) => {
        if (p.stage === 'downloading-model') {
          return {
            stage: 'downloading-model' as const,
            pageIndex,
            loaded: p.loaded,
            total: p.total,
          };
        }
        if (p.stage === 'creating-session') {
          return { stage: 'creating-session' as const, pageIndex };
        }
        return { stage: 'table-structure' as const, pageIndex, tableIndex, tableCount };
      },
    );

    return result.elements.map((el) => ({
      classId: el.classId,
      label: el.label,
      score: el.score,
      rect: mapTableElementToPageCoordinates(el.bbox, tableRect, cropSize),
    }));
  }
}
