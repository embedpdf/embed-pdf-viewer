import { BasePlugin, PluginRegistry, createScopedEmitter } from '@embedpdf/core';
import { Task, TaskSequence, Size, Rect } from '@embedpdf/models';
import {
  LayoutDetectionPipeline,
  TableStructurePipeline,
  LayoutDetectionInput,
  TableStructureInput,
  PipelineProgress,
  ImageDataLike,
  clamp,
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
} from './types';
import {
  LayoutAnalysisAction,
  initLayoutState,
  cleanupLayoutState,
  setPageStatus,
  setPageLayout,
  setPageError,
  setOverlayVisible,
  setThreshold,
  selectBlock,
} from './actions';
import {
  mapDetectionsToPageCoordinates,
  mapTableElementToPageCoordinates,
} from './coordinate-mapper';

const TABLE_CLASS_ID = 21;
const TABLE_MIN_SCORE = 0.2;
const CROP_MARGIN_RATIO = 0.12;
const CROP_MARGIN_MIN_PX = 24;
const CROP_MARGIN_MAX_PX = 64;

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

  constructor(id: string, registry: PluginRegistry, config: LayoutAnalysisPluginConfig) {
    super(id, registry);
    this.aiManager = this.registry.getPlugin<AiManagerPlugin>('ai-manager')!.provides();
    this.renderCapability = this.registry.getPlugin<RenderPlugin>('render')!.provides();
  }

  async initialize(config: LayoutAnalysisPluginConfig): Promise<void> {
    this.pluginConfig = {
      threshold: 0.35,
      tableStructure: false,
      autoAnalyze: false,
      renderScale: 2.0,
      ...config,
    };
  }

  protected onDocumentLoaded(documentId: string): void {
    this.dispatch(initLayoutState(documentId));
  }

  protected onDocumentClosed(documentId: string): void {
    this.dispatch(cleanupLayoutState(documentId));
    this.pageLayoutChange$.clearScope(documentId);
  }

  protected buildCapability(): LayoutAnalysisCapability {
    return {
      analyzePage: (pageIndex) => this.analyzePage(pageIndex),
      analyzeAllPages: () => this.analyzeAllPages(),
      getPageLayout: (pageIndex) => this.getPageLayout(pageIndex),
      forDocument: (documentId) => this.createScope(documentId),
      onPageLayoutChange: this.pageLayoutChange$.onGlobal,
      setOverlayVisible: (visible) => this.dispatch(setOverlayVisible(visible)),
      setThreshold: (t) => this.dispatch(setThreshold(t)),
      selectBlock: (id) => this.dispatch(selectBlock(id)),
    };
  }

  // ─── Public API ──────────────────────────────────────────

  private analyzePage(
    pageIndex: number,
    documentId?: string,
  ): LayoutTask<PageLayout, PageAnalysisProgress> {
    const task = new Task<PageLayout, LayoutAnalysisErrorReason, PageAnalysisProgress>();

    const docId = documentId ?? this.getActiveDocumentId();
    if (!docId) {
      task.reject({ type: 'no-document', message: 'No document loaded' });
      return task;
    }

    this.dispatch(setPageStatus(docId, pageIndex, 'analyzing'));

    this.doAnalyzePage(docId, pageIndex, task);

    return task;
  }

  private analyzeAllPages(
    documentId?: string,
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

    const pageCount = coreDoc.document.pageCount;
    const pages: PageLayout[] = [];
    let completed = 0;

    const analyzeNext = (idx: number) => {
      if (idx >= pageCount) {
        task.resolve({ pages });
        return;
      }

      const pageTask = this.analyzePage(idx, docId);

      pageTask.onProgress((p) => {
        task.progress(p);
      });

      pageTask.wait(
        (layout) => {
          pages.push(layout);
          completed++;
          task.progress({ stage: 'page-complete', pageIndex: idx, completed, total: pageCount });
          analyzeNext(idx + 1);
        },
        (err) => task.fail(err),
      );
    };

    analyzeNext(0);
    return task;
  }

  private getPageLayout(pageIndex: number, documentId?: string): PageLayout | null {
    const docId = documentId ?? this.getActiveDocumentId();
    if (!docId) return null;
    const layoutState = this.getLayoutState();
    const docState = layoutState?.documents[docId];
    return docState?.pages[pageIndex]?.layout ?? null;
  }

  private createScope(documentId: string): LayoutAnalysisScope {
    return {
      analyzePage: (pageIndex) => this.analyzePage(pageIndex, documentId),
      analyzeAllPages: () => this.analyzeAllPages(documentId),
      getPageLayout: (pageIndex) => this.getPageLayout(pageIndex, documentId),
      onPageLayoutChange: this.pageLayoutChange$.forScope(documentId),
    };
  }

  // ─── Internal pipeline ───────────────────────────────────

  private doAnalyzePage(
    documentId: string,
    pageIndex: number,
    task: Task<PageLayout, LayoutAnalysisErrorReason, PageAnalysisProgress>,
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

        // 1. Render page to raw ImageDataLike (no Blob encoding round-trip)
        task.progress({ stage: 'rendering', pageIndex });
        const imageData = await seq.run(() =>
          renderScope.renderPageRaw({
            pageIndex,
            options: { scaleFactor: this.pluginConfig.renderScale },
          }),
        );

        // 2. Run layout detection (model loading progress flows through)
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

        // 3. Map coordinates to PDF page space
        task.progress({ stage: 'mapping-coordinates', pageIndex });
        const imageSize: Size = { width: imageData.width, height: imageData.height };
        const blocks = mapDetectionsToPageCoordinates(detections, imageSize, pageSize);

        // 4. Table structure (if enabled)
        const tableStructures = new Map<number, TableStructureElement[]>();
        if (this.pluginConfig.tableStructure) {
          const tableBlocks = blocks.filter(
            (b) => b.classId === TABLE_CLASS_ID && b.score >= TABLE_MIN_SCORE,
          );

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
              tableStructures.set(tableBlock.id, elements);
            } catch {
              tableStructures.set(tableBlocks[ti].id, []);
            }
          }
        }

        // 5. Build and store result
        const layout: PageLayout = {
          pageIndex,
          blocks,
          tableStructures,
          imageSize,
          pageSize,
        };

        this.dispatch(setPageLayout(documentId, pageIndex, layout));
        this.pageLayoutChange$.emit(documentId, { pageIndex, layout });
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
        }
      },
    );
  }

  /**
   * Render just the table region from PDFium, add white padding,
   * run the table structure model, and map results to PDF coordinates.
   */
  private async analyzeTableStructure(
    tableRect: Rect,
    documentId: string,
    pageIndex: number,
    seq: TaskSequence<LayoutAnalysisErrorReason, PageAnalysisProgress>,
    tableIndex: number,
    tableCount: number,
  ): Promise<TableStructureElement[]> {
    if (tableRect.size.width < 1 || tableRect.size.height < 1) return [];

    // Render the table rect directly from PDFium (no pixel-level cropping)
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

    // Add white padding around the crop for the AI model
    const pad = computePadding(cropSize);
    const paddedData = padImageData(cropData, pad);

    // Run table structure pipeline (model loading progress flows through)
    const input: TableStructureInput = {
      imageData: paddedData,
      pageRect: { x1: 0, y1: 0, x2: paddedData.width, y2: paddedData.height },
    };

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

    // Map table element coordinates to PDF page space
    return result.elements.map((el) => ({
      classId: el.classId,
      label: el.label,
      score: el.score,
      rect: mapTableElementToPageCoordinates(el.bbox, tableRect, cropSize, pad),
    }));
  }

  private getLayoutState(): LayoutAnalysisState {
    return this.state;
  }
}

// ─── Utility functions ─────────────────────────────────────

function computePadding(cropSize: Size): number {
  const margin = Math.round(Math.min(cropSize.width, cropSize.height) * CROP_MARGIN_RATIO);
  return clamp(margin, CROP_MARGIN_MIN_PX, CROP_MARGIN_MAX_PX);
}

function padImageData(src: ImageDataLike, pad: number): ImageDataLike {
  const w = src.width + pad * 2;
  const h = src.height + pad * 2;
  const dst = new Uint8ClampedArray(w * h * 4);

  // Fill with white
  for (let i = 0; i < dst.length; i += 4) {
    dst[i] = 255;
    dst[i + 1] = 255;
    dst[i + 2] = 255;
    dst[i + 3] = 255;
  }

  // Copy source into center
  for (let dy = 0; dy < src.height; dy++) {
    const srcOffset = dy * src.width * 4;
    const dstOffset = ((dy + pad) * w + pad) * 4;
    dst.set(src.data.subarray(srcOffset, srcOffset + src.width * 4), dstOffset);
  }

  return { data: dst, width: w, height: h };
}
