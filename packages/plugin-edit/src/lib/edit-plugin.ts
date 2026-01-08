import { BasePlugin, createScopedEmitter, PluginRegistry } from '@embedpdf/core';
import {
  ignore,
  Task,
  PdfTask,
  PdfTaskHelper,
  PdfErrorCode,
  PdfErrorReason,
  PdfTextBlock,
  Position,
  PdfLayoutSummary,
  PdfWord,
  PdfLine,
  PdfColumn,
  PdfTable,
  PdfTextBlockDetectionFlag,
} from '@embedpdf/models';
import {
  EditCapability,
  EditPluginConfig,
  EditState,
  EditPageState,
  EditScope,
  RegisterEditOnPageOptions,
  RenderBackgroundOptions,
  RenderTextBlockOptions,
  RenderDebugOverlayOptions,
  DetectBlocksOptions,
  EditPageStateChangeEvent,
  BlockSelectedEvent,
  BlockOffsetChangeEvent,
  DetectionCompleteEvent,
} from './types';
import {
  EditAction,
  initEditState,
  cleanupEditState,
  initPageState,
  setDetectionStatus,
  setTextBlocks,
  setLayoutData,
  selectBlock,
  deselectBlock,
  setBlockOffset,
  clearBlockOffset,
} from './actions';
import { initialDocumentState, initialPageState } from './reducer';

export class EditPlugin extends BasePlugin<
  EditPluginConfig,
  EditCapability,
  EditState,
  EditAction
> {
  static readonly id = 'edit' as const;

  public readonly config: EditPluginConfig;

  // Per-document page callbacks
  private pageCallbacks = new Map<string, Map<number, (state: EditPageState) => void>>();

  // Event emitters
  private readonly pageStateChange$ = createScopedEmitter<
    EditPageState,
    EditPageStateChangeEvent,
    string
  >((documentId, state) => {
    // Extract pageIndex from the callback context
    const pageIndex = this.getPageIndexFromState(documentId, state);
    return { documentId, pageIndex, state };
  });

  private readonly blockSelected$ = createScopedEmitter<
    { blockIndex: number | null; block: PdfTextBlock | null },
    BlockSelectedEvent,
    string
  >((documentId, data) => {
    const pageIndex = this.getSelectedPageIndex(documentId);
    return { documentId, pageIndex, ...data };
  });

  private readonly blockOffsetChange$ = createScopedEmitter<
    { pageIndex: number; blockIndex: number; offset: Position },
    BlockOffsetChangeEvent,
    string
  >((documentId, data) => ({ documentId, ...data }));

  private readonly detectionComplete$ = createScopedEmitter<
    { pageIndex: number; blocks: PdfTextBlock[] },
    DetectionCompleteEvent,
    string
  >((documentId, data) => ({ documentId, ...data }));

  constructor(id: string, registry: PluginRegistry, config: EditPluginConfig) {
    super(id, registry);
    this.config = config;
  }

  // ─────────────────────────────────────────────────────────
  // Document Lifecycle
  // ─────────────────────────────────────────────────────────

  protected override onDocumentLoadingStarted(documentId: string): void {
    this.dispatch(initEditState(documentId, initialDocumentState));
    this.pageCallbacks.set(documentId, new Map());
  }

  protected override onDocumentClosed(documentId: string): void {
    this.dispatch(cleanupEditState(documentId));
    this.pageCallbacks.delete(documentId);
    this.pageStateChange$.clearScope(documentId);
    this.blockSelected$.clearScope(documentId);
    this.blockOffsetChange$.clearScope(documentId);
    this.detectionComplete$.clearScope(documentId);
  }

  async initialize(): Promise<void> {
    // No initialization needed
  }

  // ─────────────────────────────────────────────────────────
  // Capability
  // ─────────────────────────────────────────────────────────

  protected buildCapability(): EditCapability {
    return {
      // Active document operations
      detectBlocks: (pageIndex, options) => this.detectBlocks(pageIndex, undefined, options),
      invalidateAndRedetect: (pageIndex, options) =>
        this.invalidateAndRedetect(pageIndex, undefined, options),
      getTextBlocks: (pageIndex) => this.getTextBlocks(pageIndex),
      getPageState: (pageIndex) => this.getPageState(pageIndex),
      getLayoutSummary: (pageIndex) => this.getLayoutSummary(pageIndex),
      getWords: (pageIndex) => this.getWords(pageIndex),
      getLines: (pageIndex) => this.getLines(pageIndex),
      getColumns: (pageIndex) => this.getColumns(pageIndex),
      getTables: (pageIndex) => this.getTables(pageIndex),
      selectBlock: (pageIndex, blockIndex) => this.selectBlockAction(pageIndex, blockIndex),
      getSelectedBlock: () => this.getSelectedBlock(),
      setBlockOffset: (pageIndex, blockIndex, offset) =>
        this.setBlockOffsetAction(pageIndex, blockIndex, offset),
      clearBlockOffset: (pageIndex, blockIndex) =>
        this.clearBlockOffsetAction(pageIndex, blockIndex),
      getBlockOffset: (pageIndex, blockIndex) => this.getBlockOffset(pageIndex, blockIndex),
      renderBackground: (pageIndex, options) => this.renderBackground(pageIndex, options),
      renderTextBlock: (pageIndex, options) => this.renderTextBlockImage(pageIndex, options),
      renderDebugOverlay: (pageIndex, options) => this.renderDebugOverlay(pageIndex, options),

      // Document-scoped
      forDocument: (documentId) => this.createEditScope(documentId),

      // Registration
      registerEditOnPage: (options) => this.registerEditOnPage(options),

      // Events
      onPageStateChange: this.pageStateChange$.onGlobal,
      onBlockSelected: this.blockSelected$.onGlobal,
      onBlockOffsetChange: this.blockOffsetChange$.onGlobal,
      onDetectionComplete: this.detectionComplete$.onGlobal,
    };
  }

  private createEditScope(documentId: string): EditScope {
    return {
      detectBlocks: (pageIndex, options) => this.detectBlocks(pageIndex, documentId, options),
      invalidateAndRedetect: (pageIndex, options) =>
        this.invalidateAndRedetect(pageIndex, documentId, options),
      getTextBlocks: (pageIndex) => this.getTextBlocks(pageIndex, documentId),
      getPageState: (pageIndex) => this.getPageState(pageIndex, documentId),
      getLayoutSummary: (pageIndex) => this.getLayoutSummary(pageIndex, documentId),
      getWords: (pageIndex) => this.getWords(pageIndex, documentId),
      getLines: (pageIndex) => this.getLines(pageIndex, documentId),
      getColumns: (pageIndex) => this.getColumns(pageIndex, documentId),
      getTables: (pageIndex) => this.getTables(pageIndex, documentId),
      selectBlock: (pageIndex, blockIndex) =>
        this.selectBlockAction(pageIndex, blockIndex, documentId),
      getSelectedBlock: () => this.getSelectedBlock(documentId),
      setBlockOffset: (pageIndex, blockIndex, offset) =>
        this.setBlockOffsetAction(pageIndex, blockIndex, offset, documentId),
      clearBlockOffset: (pageIndex, blockIndex) =>
        this.clearBlockOffsetAction(pageIndex, blockIndex, documentId),
      getBlockOffset: (pageIndex, blockIndex) =>
        this.getBlockOffset(pageIndex, blockIndex, documentId),
      renderBackground: (pageIndex, options) =>
        this.renderBackground(pageIndex, options, documentId),
      renderTextBlock: (pageIndex, options) =>
        this.renderTextBlockImage(pageIndex, options, documentId),
      renderDebugOverlay: (pageIndex, options) =>
        this.renderDebugOverlay(pageIndex, options, documentId),
      onPageStateChange: this.pageStateChange$.forScope(documentId),
      onBlockSelected: this.blockSelected$.forScope(documentId),
    };
  }

  // ─────────────────────────────────────────────────────────
  // Registration
  // ─────────────────────────────────────────────────────────

  public registerEditOnPage(options: RegisterEditOnPageOptions): () => void {
    const { documentId, pageIndex, onStateChange } = options;
    const docState = this.state.documents[documentId];

    if (!docState) {
      this.logger.warn(
        'EditPlugin',
        'RegisterFailed',
        `Cannot register on page ${pageIndex} for document ${documentId}: document state not initialized.`,
      );
      return () => {};
    }

    // Initialize page state if needed
    if (!docState.pages[pageIndex]) {
      this.dispatch(initPageState(documentId, pageIndex, initialPageState));
    }

    // Track callback
    this.pageCallbacks.get(documentId)?.set(pageIndex, onStateChange);

    // Send initial state
    const pageState = this.state.documents[documentId]?.pages[pageIndex] || initialPageState;
    onStateChange(pageState);

    // Auto-detect if enabled and not already detected
    if (this.config.autoDetect !== false && pageState.detectionStatus === 'idle') {
      this.detectBlocks(pageIndex, documentId).wait(() => {}, ignore);
    }

    // Return cleanup
    return () => {
      this.pageCallbacks.get(documentId)?.delete(pageIndex);
    };
  }

  // ─────────────────────────────────────────────────────────
  // Detection
  // ─────────────────────────────────────────────────────────

  private detectBlocks(
    pageIndex: number,
    documentId?: string,
    options?: DetectBlocksOptions,
  ): PdfTask<boolean> {
    const docId = documentId ?? this.getActiveDocumentId();
    const coreDoc = this.getCoreDocument(docId);

    if (!coreDoc?.document) {
      return PdfTaskHelper.reject({
        code: PdfErrorCode.NotFound,
        message: 'Document not found',
      });
    }

    const page = coreDoc.document.pages[pageIndex];
    if (!page) {
      return PdfTaskHelper.reject({
        code: PdfErrorCode.NotFound,
        message: `Page ${pageIndex} not found`,
      });
    }

    // Check if already detecting
    const pageState = this.state.documents[docId]?.pages[pageIndex];
    if (pageState?.detectionStatus === 'detecting') {
      return PdfTaskHelper.resolve(false);
    }

    // Set status to detecting
    this.dispatch(setDetectionStatus(docId, pageIndex, 'detecting'));
    this.notifyPage(docId, pageIndex);

    // Merge detection flags from config and options
    // Default to new pipeline for full layout detection (words, lines, columns, tables)
    const flags =
      options?.flags ?? this.config.detectionFlags ?? PdfTextBlockDetectionFlag.UseNewPipeline;

    // Call engine
    const detectTask = this.engine.detectTextBlocks(coreDoc.document, page, { flags });

    const resultTask = new Task<boolean, PdfErrorReason>();

    detectTask.wait(
      (success) => {
        if (!success) {
          this.dispatch(setDetectionStatus(docId, pageIndex, 'error'));
          this.notifyPage(docId, pageIndex);
          resultTask.resolve(false);
          return;
        }

        // Get the blocks and layout data in parallel
        const doc = coreDoc.document!;
        const getBlocksTask = this.engine.getTextBlocks(doc, page);
        const getLayoutSummaryTask = this.engine.getLayoutSummary(doc, page);
        const getWordsTask = this.engine.getWords(doc, page);
        const getLinesTask = this.engine.getLines(doc, page);
        const getColumnsTask = this.engine.getColumns(doc, page);
        const getTablesTask = this.engine.getTables(doc, page);

        // Wait for blocks first
        getBlocksTask.wait(
          (blocks) => {
            this.dispatch(setTextBlocks(docId, pageIndex, blocks));
            this.notifyPage(docId, pageIndex);
            this.detectionComplete$.emit(docId, { pageIndex, blocks });

            // Then fetch layout data (non-blocking)
            Promise.all([
              new Promise<PdfLayoutSummary>((resolve, reject) =>
                getLayoutSummaryTask.wait(resolve, reject),
              ),
              new Promise<PdfWord[]>((resolve, reject) => getWordsTask.wait(resolve, reject)),
              new Promise<PdfLine[]>((resolve, reject) => getLinesTask.wait(resolve, reject)),
              new Promise<PdfColumn[]>((resolve, reject) => getColumnsTask.wait(resolve, reject)),
              new Promise<PdfTable[]>((resolve, reject) => getTablesTask.wait(resolve, reject)),
            ])
              .then(([layoutSummary, words, lines, columns, tables]) => {
                this.dispatch(
                  setLayoutData(docId, pageIndex, layoutSummary, words, lines, columns, tables),
                );
                this.notifyPage(docId, pageIndex);
              })
              .catch(() => {
                // Layout data is optional, don't fail the detection
              });

            resultTask.resolve(true);
          },
          (error) => {
            this.dispatch(setDetectionStatus(docId, pageIndex, 'error'));
            this.notifyPage(docId, pageIndex);
            resultTask.fail(error);
          },
        );
      },
      (error) => {
        this.dispatch(setDetectionStatus(docId, pageIndex, 'error'));
        this.notifyPage(docId, pageIndex);
        resultTask.fail(error);
      },
    );

    return resultTask;
  }

  private invalidateAndRedetect(
    pageIndex: number,
    documentId?: string,
    options?: DetectBlocksOptions,
  ): PdfTask<boolean> {
    const docId = documentId ?? this.getActiveDocumentId();
    const coreDoc = this.getCoreDocument(docId);

    if (!coreDoc?.document) {
      return PdfTaskHelper.reject({
        code: PdfErrorCode.NotFound,
        message: 'Document not found',
      });
    }

    const page = coreDoc.document.pages[pageIndex];
    if (!page) {
      return PdfTaskHelper.reject({
        code: PdfErrorCode.NotFound,
        message: `Page ${pageIndex} not found`,
      });
    }

    // Invalidate first
    const invalidateTask = this.engine.invalidateTextBlocks(coreDoc.document, page);

    const resultTask = new Task<boolean, PdfErrorReason>();

    invalidateTask.wait(() => {
      // Reset state and re-detect
      this.dispatch(setDetectionStatus(docId, pageIndex, 'idle'));
      this.detectBlocks(pageIndex, docId, options).wait(
        (result) => resultTask.resolve(result),
        resultTask.fail,
      );
    }, resultTask.fail);

    return resultTask;
  }

  // ─────────────────────────────────────────────────────────
  // Getters
  // ─────────────────────────────────────────────────────────

  private getTextBlocks(pageIndex: number, documentId?: string): PdfTextBlock[] {
    const docId = documentId ?? this.getActiveDocumentId();
    return this.state.documents[docId]?.pages[pageIndex]?.textBlocks ?? [];
  }

  private getPageState(pageIndex: number, documentId?: string): EditPageState | null {
    const docId = documentId ?? this.getActiveDocumentId();
    return this.state.documents[docId]?.pages[pageIndex] ?? null;
  }

  private getLayoutSummary(pageIndex: number, documentId?: string): PdfLayoutSummary | null {
    const docId = documentId ?? this.getActiveDocumentId();
    return this.state.documents[docId]?.pages[pageIndex]?.layoutSummary ?? null;
  }

  private getWords(pageIndex: number, documentId?: string): PdfWord[] {
    const docId = documentId ?? this.getActiveDocumentId();
    return this.state.documents[docId]?.pages[pageIndex]?.words ?? [];
  }

  private getLines(pageIndex: number, documentId?: string): PdfLine[] {
    const docId = documentId ?? this.getActiveDocumentId();
    return this.state.documents[docId]?.pages[pageIndex]?.lines ?? [];
  }

  private getColumns(pageIndex: number, documentId?: string): PdfColumn[] {
    const docId = documentId ?? this.getActiveDocumentId();
    return this.state.documents[docId]?.pages[pageIndex]?.columns ?? [];
  }

  private getTables(pageIndex: number, documentId?: string): PdfTable[] {
    const docId = documentId ?? this.getActiveDocumentId();
    return this.state.documents[docId]?.pages[pageIndex]?.tables ?? [];
  }

  private getSelectedBlock(
    documentId?: string,
  ): { pageIndex: number; blockIndex: number; block: PdfTextBlock } | null {
    const docId = documentId ?? this.getActiveDocumentId();
    const docState = this.state.documents[docId];
    if (!docState) return null;

    for (const [pageIdx, pageState] of Object.entries(docState.pages)) {
      if (pageState.selectedBlockIndex !== null) {
        const block = pageState.textBlocks[pageState.selectedBlockIndex];
        if (block) {
          return {
            pageIndex: parseInt(pageIdx, 10),
            blockIndex: pageState.selectedBlockIndex,
            block,
          };
        }
      }
    }
    return null;
  }

  private getBlockOffset(
    pageIndex: number,
    blockIndex: number,
    documentId?: string,
  ): Position | null {
    const docId = documentId ?? this.getActiveDocumentId();
    return this.state.documents[docId]?.pages[pageIndex]?.blockOffsets[blockIndex] ?? null;
  }

  // ─────────────────────────────────────────────────────────
  // Actions
  // ─────────────────────────────────────────────────────────

  private selectBlockAction(
    pageIndex: number,
    blockIndex: number | null,
    documentId?: string,
  ): void {
    const docId = documentId ?? this.getActiveDocumentId();

    if (blockIndex === null) {
      this.dispatch(deselectBlock(docId));
    } else {
      this.dispatch(selectBlock(docId, pageIndex, blockIndex));
    }

    // Emit event
    const block = blockIndex !== null ? this.getTextBlocks(pageIndex, docId)[blockIndex] : null;
    this.blockSelected$.emit(docId, { blockIndex, block });

    // Notify all pages (since deselection affects multiple pages)
    const docState = this.state.documents[docId];
    if (docState) {
      for (const pageIdx of Object.keys(docState.pages)) {
        this.notifyPage(docId, parseInt(pageIdx, 10));
      }
    }
  }

  private setBlockOffsetAction(
    pageIndex: number,
    blockIndex: number,
    offset: Position,
    documentId?: string,
  ): void {
    const docId = documentId ?? this.getActiveDocumentId();
    this.dispatch(setBlockOffset(docId, pageIndex, blockIndex, offset));
    this.blockOffsetChange$.emit(docId, { pageIndex, blockIndex, offset });
    this.notifyPage(docId, pageIndex);
  }

  private clearBlockOffsetAction(pageIndex: number, blockIndex: number, documentId?: string): void {
    const docId = documentId ?? this.getActiveDocumentId();
    this.dispatch(clearBlockOffset(docId, pageIndex, blockIndex));
    this.notifyPage(docId, pageIndex);
  }

  // ─────────────────────────────────────────────────────────
  // Rendering
  // ─────────────────────────────────────────────────────────

  private renderBackground(
    pageIndex: number,
    options: RenderBackgroundOptions,
    documentId?: string,
  ): PdfTask<Blob> {
    const docId = documentId ?? this.getActiveDocumentId();
    const coreDoc = this.getCoreDocument(docId);

    if (!coreDoc?.document) {
      return PdfTaskHelper.reject({
        code: PdfErrorCode.NotFound,
        message: 'Document not found',
      });
    }

    const page = coreDoc.document.pages[pageIndex];
    if (!page) {
      return PdfTaskHelper.reject({
        code: PdfErrorCode.NotFound,
        message: `Page ${pageIndex} not found`,
      });
    }

    return this.engine.renderPageBackground(coreDoc.document, page, {
      scaleFactor: options.scale,
      rotation: options.rotation,
    });
  }

  private renderTextBlockImage(
    pageIndex: number,
    options: RenderTextBlockOptions,
    documentId?: string,
  ): PdfTask<Blob> {
    const docId = documentId ?? this.getActiveDocumentId();
    const coreDoc = this.getCoreDocument(docId);

    if (!coreDoc?.document) {
      return PdfTaskHelper.reject({
        code: PdfErrorCode.NotFound,
        message: 'Document not found',
      });
    }

    const page = coreDoc.document.pages[pageIndex];
    if (!page) {
      return PdfTaskHelper.reject({
        code: PdfErrorCode.NotFound,
        message: `Page ${pageIndex} not found`,
      });
    }

    return this.engine.renderTextBlock(coreDoc.document, page, options.blockIndex, {
      scale: options.scale,
      rotation: options.rotation,
    });
  }

  private renderDebugOverlay(
    pageIndex: number,
    options: RenderDebugOverlayOptions,
    documentId?: string,
  ): PdfTask<Blob> {
    const docId = documentId ?? this.getActiveDocumentId();
    const coreDoc = this.getCoreDocument(docId);

    if (!coreDoc?.document) {
      return PdfTaskHelper.reject({
        code: PdfErrorCode.NotFound,
        message: 'Document not found',
      });
    }

    const page = coreDoc.document.pages[pageIndex];
    if (!page) {
      return PdfTaskHelper.reject({
        code: PdfErrorCode.NotFound,
        message: `Page ${pageIndex} not found`,
      });
    }

    return this.engine.renderLayoutDebugOverlay(coreDoc.document, page, {
      scaleFactor: options.scale,
      rotation: options.rotation,
      debugFlags: options.debugFlags,
    });
  }

  // ─────────────────────────────────────────────────────────
  // Helpers
  // ─────────────────────────────────────────────────────────

  private notifyPage(documentId: string, pageIndex: number): void {
    const callback = this.pageCallbacks.get(documentId)?.get(pageIndex);
    if (callback) {
      const pageState = this.state.documents[documentId]?.pages[pageIndex];
      if (pageState) {
        callback(pageState);
        this.pageStateChange$.emit(documentId, pageState);
      }
    }
  }

  private getPageIndexFromState(documentId: string, targetState: EditPageState): number {
    const docState = this.state.documents[documentId];
    if (!docState) return -1;
    for (const [pageIdx, pageState] of Object.entries(docState.pages)) {
      if (pageState === targetState) {
        return parseInt(pageIdx, 10);
      }
    }
    return -1;
  }

  private getSelectedPageIndex(documentId: string): number {
    const selected = this.getSelectedBlock(documentId);
    return selected?.pageIndex ?? -1;
  }

  override onStoreUpdated(prev: EditState, next: EditState): void {
    // Could emit state changes here if needed
  }
}
