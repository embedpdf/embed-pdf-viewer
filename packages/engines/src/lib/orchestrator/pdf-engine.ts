import {
  Logger,
  NoopLogger,
  PdfEngine as IPdfEngine,
  PdfDocumentObject,
  PdfPageObject,
  PdfTask,
  PdfErrorReason,
  PdfFileUrl,
  PdfFile,
  PdfOpenDocumentUrlOptions,
  PdfOpenDocumentBufferOptions,
  PdfMetadataObject,
  PdfBookmarksObject,
  PdfBookmarkObject,
  PdfRenderPageOptions,
  PdfRenderThumbnailOptions,
  PdfRenderPageAnnotationOptions,
  PdfAnnotationObject,
  PdfTextRectObject,
  PdfSearchAllPagesOptions,
  SearchAllPagesResult,
  PdfPageSearchProgress,
  PdfAnnotationsProgress,
  PdfAttachmentObject,
  PdfAddAttachmentParams,
  PdfWidgetAnnoObject,
  FormFieldValue,
  PdfFlattenPageOptions,
  PdfPageFlattenResult,
  PdfRedactTextOptions,
  Rect,
  PageTextSlice,
  PdfGlyphObject,
  PdfPageGeometry,
  PdfPrintOptions,
  PdfEngineFeature,
  PdfEngineOperation,
  PdfSignatureObject,
  AnnotationCreateContext,
  Task,
  PdfErrorCode,
  SearchResult,
  CompoundTask,
  ImageDataLike,
} from '@embedpdf/models';
import { WorkerTaskQueue, Priority } from './task-queue';
import type { ImageDataConverter } from '../converters/types';

// Re-export for convenience
export type { ImageDataConverter } from '../converters/types';
export type { ImageDataLike } from '@embedpdf/models';

const LOG_SOURCE = 'PdfEngine';
const LOG_CATEGORY = 'Orchestrator';

/**
 * Executor interface that can be either PdfiumNative or RemoteExecutor
 */
export interface IPdfExecutor {
  // Core operations (single page, synchronous in nature)
  initialize(): void;
  destroy(): void;
  openDocumentBuffer(
    file: PdfFile,
    options?: PdfOpenDocumentBufferOptions,
  ): PdfTask<PdfDocumentObject>;
  getMetadata(doc: PdfDocumentObject): PdfTask<PdfMetadataObject>;
  setMetadata(doc: PdfDocumentObject, metadata: Partial<PdfMetadataObject>): PdfTask<boolean>;
  getDocPermissions(doc: PdfDocumentObject): PdfTask<number>;
  getDocUserPermissions(doc: PdfDocumentObject): PdfTask<number>;
  getSignatures(doc: PdfDocumentObject): PdfTask<PdfSignatureObject[]>;
  getBookmarks(doc: PdfDocumentObject): PdfTask<PdfBookmarksObject>;
  setBookmarks(doc: PdfDocumentObject, bookmarks: PdfBookmarkObject[]): PdfTask<boolean>;
  deleteBookmarks(doc: PdfDocumentObject): PdfTask<boolean>;

  // Raw rendering (returns ImageData-like object, not Blob)
  renderPageRaw(
    doc: PdfDocumentObject,
    page: PdfPageObject,
    options?: PdfRenderPageOptions,
  ): PdfTask<ImageDataLike>;
  renderPageRect(
    doc: PdfDocumentObject,
    page: PdfPageObject,
    rect: Rect,
    options?: PdfRenderPageOptions,
  ): PdfTask<ImageDataLike>;
  renderThumbnailRaw(
    doc: PdfDocumentObject,
    page: PdfPageObject,
    options?: PdfRenderThumbnailOptions,
  ): PdfTask<ImageDataLike>;
  renderPageAnnotationRaw(
    doc: PdfDocumentObject,
    page: PdfPageObject,
    annotation: PdfAnnotationObject,
    options?: PdfRenderPageAnnotationOptions,
  ): PdfTask<ImageDataLike>;

  // Single page operations
  getPageAnnotations(doc: PdfDocumentObject, page: PdfPageObject): PdfTask<PdfAnnotationObject[]>;
  createPageAnnotation<A extends PdfAnnotationObject>(
    doc: PdfDocumentObject,
    page: PdfPageObject,
    annotation: A,
    context?: AnnotationCreateContext<A>,
  ): PdfTask<string>;
  updatePageAnnotation(
    doc: PdfDocumentObject,
    page: PdfPageObject,
    annotation: PdfAnnotationObject,
  ): PdfTask<boolean>;
  removePageAnnotation(
    doc: PdfDocumentObject,
    page: PdfPageObject,
    annotation: PdfAnnotationObject,
  ): PdfTask<boolean>;
  getPageTextRects(doc: PdfDocumentObject, page: PdfPageObject): PdfTask<PdfTextRectObject[]>;

  // Single page search
  searchInPage(
    doc: PdfDocumentObject,
    page: PdfPageObject,
    keyword: string,
    flags: number,
  ): PdfTask<SearchResult[]>;

  // Other operations
  getAttachments(doc: PdfDocumentObject): PdfTask<PdfAttachmentObject[]>;
  addAttachment(doc: PdfDocumentObject, params: PdfAddAttachmentParams): PdfTask<boolean>;
  removeAttachment(doc: PdfDocumentObject, attachment: PdfAttachmentObject): PdfTask<boolean>;
  readAttachmentContent(
    doc: PdfDocumentObject,
    attachment: PdfAttachmentObject,
  ): PdfTask<ArrayBuffer>;
  setFormFieldValue(
    doc: PdfDocumentObject,
    page: PdfPageObject,
    annotation: PdfWidgetAnnoObject,
    value: FormFieldValue,
  ): PdfTask<boolean>;
  flattenPage(
    doc: PdfDocumentObject,
    page: PdfPageObject,
    options?: PdfFlattenPageOptions,
  ): PdfTask<PdfPageFlattenResult>;
  extractPages(doc: PdfDocumentObject, pageIndexes: number[]): PdfTask<ArrayBuffer>;
  extractText(doc: PdfDocumentObject, pageIndexes: number[]): PdfTask<string>;
  redactTextInRects(
    doc: PdfDocumentObject,
    page: PdfPageObject,
    rects: Rect[],
    options?: PdfRedactTextOptions,
  ): PdfTask<boolean>;
  getTextSlices(doc: PdfDocumentObject, slices: PageTextSlice[]): PdfTask<string[]>;
  getPageGlyphs(doc: PdfDocumentObject, page: PdfPageObject): PdfTask<PdfGlyphObject[]>;
  getPageGeometry(doc: PdfDocumentObject, page: PdfPageObject): PdfTask<PdfPageGeometry>;
  merge(files: PdfFile[]): PdfTask<PdfFile>;
  mergePages(mergeConfigs: Array<{ docId: string; pageIndices: number[] }>): PdfTask<PdfFile>;
  preparePrintDocument(doc: PdfDocumentObject, options?: PdfPrintOptions): PdfTask<ArrayBuffer>;
  saveAsCopy(doc: PdfDocumentObject): PdfTask<ArrayBuffer>;
  closeDocument(doc: PdfDocumentObject): PdfTask<boolean>;
  closeAllDocuments(): PdfTask<boolean>;
}

export interface PdfEngineOptions<T> {
  /**
   * Image data converter (for encoding raw image data to Blob/other format)
   */
  imageConverter: ImageDataConverter<T>;
  /**
   * Fetch function for fetching remote URLs
   */
  fetcher?: typeof fetch;
  /**
   * Logger instance
   */
  logger?: Logger;
}

/**
 * PdfEngine orchestrator
 *
 * This is the "smart" layer that:
 * - Implements the PdfEngine interface
 * - Uses WorkerTaskQueue for priority-based task scheduling
 * - Orchestrates complex multi-page operations
 * - Handles image encoding with separate encoder pool
 * - Manages visibility-based task ranking
 */
export class PdfEngine<T = Blob> implements IPdfEngine<T> {
  private executor: IPdfExecutor;
  private workerQueue: WorkerTaskQueue;
  private logger: Logger;
  private options: PdfEngineOptions<T>;

  constructor(executor: IPdfExecutor, options: PdfEngineOptions<T>) {
    this.executor = executor;
    this.logger = options.logger ?? new NoopLogger();
    this.options = {
      imageConverter: options.imageConverter,
      fetcher:
        options.fetcher ??
        (typeof fetch !== 'undefined' ? (url, init) => fetch(url, init) : undefined),
      logger: this.logger,
    };

    // Create worker queue with single concurrency (PDFium is single-threaded)
    this.workerQueue = new WorkerTaskQueue({
      concurrency: 1,
      autoStart: true,
    });

    this.logger.debug(LOG_SOURCE, LOG_CATEGORY, 'PdfEngine orchestrator created');
  }

  /**
   * Update visible pages for visibility-based task ranking
   */
  setVisiblePages(pages: Array<{ pageIndex: number; visibility: number }>): void {
    this.workerQueue.setVisiblePages(pages);
    this.logger.debug(LOG_SOURCE, LOG_CATEGORY, `Updated visible pages: ${pages.length} pages`);
  }

  // ========== IPdfEngine Implementation ==========

  isSupport(feature: PdfEngineFeature): PdfTask<PdfEngineOperation[]> {
    const task = new Task<PdfEngineOperation[], PdfErrorReason>();
    // PDFium supports all features
    task.resolve([
      PdfEngineOperation.Create,
      PdfEngineOperation.Read,
      PdfEngineOperation.Update,
      PdfEngineOperation.Delete,
    ]);
    return task;
  }

  initialize(): PdfTask<boolean> {
    const task = new Task<boolean, PdfErrorReason>();
    try {
      this.executor.initialize();
      task.resolve(true);
    } catch (error) {
      task.reject({ code: PdfErrorCode.Unknown, message: String(error) });
    }
    return task;
  }

  destroy(): PdfTask<boolean> {
    const task = new Task<boolean, PdfErrorReason>();
    try {
      this.executor.destroy();
      task.resolve(true);
    } catch (error) {
      task.reject({ code: PdfErrorCode.Unknown, message: String(error) });
    }
    return task;
  }

  openDocumentUrl(
    file: PdfFileUrl,
    options?: PdfOpenDocumentUrlOptions,
  ): PdfTask<PdfDocumentObject> {
    const task = new Task<PdfDocumentObject, PdfErrorReason>();

    // Handle fetch in main thread (not worker!)
    (async () => {
      try {
        if (!this.options.fetcher) {
          throw new Error('Fetcher is not set');
        }

        const response = await this.options.fetcher(file.url, options?.requestOptions);
        const arrayBuf = await response.arrayBuffer();

        const pdfFile: PdfFile = {
          id: file.id,
          content: arrayBuf,
        };

        // Then open in worker
        const doc = await this.openDocumentBuffer(pdfFile, {
          password: options?.password,
        }).toPromise();

        task.resolve(doc);
      } catch (error) {
        task.reject({ code: PdfErrorCode.Unknown, message: String(error) });
      }
    })();

    return task;
  }

  openDocumentBuffer(
    file: PdfFile,
    options?: PdfOpenDocumentBufferOptions,
  ): PdfTask<PdfDocumentObject> {
    return this.workerQueue.enqueue(
      {
        execute: () => this.executor.openDocumentBuffer(file, options),
        meta: { docId: file.id, operation: 'openDocumentBuffer' },
      },
      { priority: Priority.CRITICAL },
    );
  }

  getMetadata(doc: PdfDocumentObject): PdfTask<PdfMetadataObject> {
    return this.workerQueue.enqueue(
      {
        execute: () => this.executor.getMetadata(doc),
        meta: { docId: doc.id, operation: 'getMetadata' },
      },
      { priority: Priority.LOW },
    );
  }

  setMetadata(doc: PdfDocumentObject, metadata: Partial<PdfMetadataObject>): PdfTask<boolean> {
    return this.workerQueue.enqueue(
      {
        execute: () => this.executor.setMetadata(doc, metadata),
        meta: { docId: doc.id, operation: 'setMetadata' },
      },
      { priority: Priority.LOW },
    );
  }

  getDocPermissions(doc: PdfDocumentObject): PdfTask<number> {
    return this.workerQueue.enqueue(
      {
        execute: () => this.executor.getDocPermissions(doc),
        meta: { docId: doc.id, operation: 'getDocPermissions' },
      },
      { priority: Priority.LOW },
    );
  }

  getDocUserPermissions(doc: PdfDocumentObject): PdfTask<number> {
    return this.workerQueue.enqueue(
      {
        execute: () => this.executor.getDocUserPermissions(doc),
        meta: { docId: doc.id, operation: 'getDocUserPermissions' },
      },
      { priority: Priority.LOW },
    );
  }

  getSignatures(doc: PdfDocumentObject): PdfTask<PdfSignatureObject[]> {
    return this.workerQueue.enqueue(
      {
        execute: () => this.executor.getSignatures(doc),
        meta: { docId: doc.id, operation: 'getSignatures' },
      },
      { priority: Priority.LOW },
    );
  }

  getBookmarks(doc: PdfDocumentObject): PdfTask<PdfBookmarksObject> {
    return this.workerQueue.enqueue(
      {
        execute: () => this.executor.getBookmarks(doc),
        meta: { docId: doc.id, operation: 'getBookmarks' },
      },
      { priority: Priority.LOW },
    );
  }

  setBookmarks(doc: PdfDocumentObject, bookmarks: PdfBookmarkObject[]): PdfTask<boolean> {
    return this.workerQueue.enqueue(
      {
        execute: () => this.executor.setBookmarks(doc, bookmarks),
        meta: { docId: doc.id, operation: 'setBookmarks' },
      },
      { priority: Priority.LOW },
    );
  }

  deleteBookmarks(doc: PdfDocumentObject): PdfTask<boolean> {
    return this.workerQueue.enqueue(
      {
        execute: () => this.executor.deleteBookmarks(doc),
        meta: { docId: doc.id, operation: 'deleteBookmarks' },
      },
      { priority: Priority.LOW },
    );
  }

  // ========== Rendering with Encoding ==========

  renderPage(
    doc: PdfDocumentObject,
    page: PdfPageObject,
    options?: PdfRenderPageOptions,
  ): PdfTask<T> {
    return this.renderWithEncoding(
      () => this.executor.renderPageRaw(doc, page, options),
      options,
      doc.id,
      page.index,
      Priority.HIGH,
    );
  }

  renderPageRect(
    doc: PdfDocumentObject,
    page: PdfPageObject,
    rect: Rect,
    options?: PdfRenderPageOptions,
  ): PdfTask<T> {
    return this.renderWithEncoding(
      () => this.executor.renderPageRect(doc, page, rect, options),
      options,
      doc.id,
      page.index,
      Priority.MEDIUM,
    );
  }

  renderThumbnail(
    doc: PdfDocumentObject,
    page: PdfPageObject,
    options?: PdfRenderThumbnailOptions,
  ): PdfTask<T> {
    return this.renderWithEncoding(
      () => this.executor.renderThumbnailRaw(doc, page, options),
      options,
      doc.id,
      page.index,
      Priority.LOW,
    );
  }

  renderPageAnnotation(
    doc: PdfDocumentObject,
    page: PdfPageObject,
    annotation: PdfAnnotationObject,
    options?: PdfRenderPageAnnotationOptions,
  ): PdfTask<T> {
    return this.renderWithEncoding(
      () => this.executor.renderPageAnnotationRaw(doc, page, annotation, options),
      options,
      doc.id,
      page.index,
      Priority.LOW,
    );
  }

  /**
   * Helper to render and encode in two stages with priority queue
   */
  private renderWithEncoding(
    renderFn: () => PdfTask<ImageDataLike>,
    options?: PdfRenderPageOptions | PdfRenderThumbnailOptions | PdfRenderPageAnnotationOptions,
    docId?: string,
    pageIndex?: number,
    priority: Priority = Priority.HIGH,
  ): PdfTask<T> {
    const resultTask = new Task<T, PdfErrorReason>();

    // Step 1: Add HIGH/MEDIUM priority task to render raw bytes
    const renderHandle = this.workerQueue.enqueue(
      {
        execute: () => renderFn(),
        meta: { docId, pageIndex, operation: 'render' },
      },
      { priority },
    );

    renderHandle.wait(
      (rawImageData) => {
        this.encodeImage(rawImageData, options, resultTask);
      },
      (error) => {
        resultTask.fail(error);
      },
    );

    return resultTask;
  }

  /**
   * Encode image using encoder pool or inline
   */
  private encodeImage(
    rawImageData: ImageDataLike,
    options: any,
    resultTask: Task<T, PdfErrorReason>,
  ): void {
    const imageType = options?.imageType ?? 'image/webp';
    const quality = options?.quality;

    // Convert to plain object for encoding
    const plainImageData = {
      data: new Uint8ClampedArray(rawImageData.data),
      width: rawImageData.width,
      height: rawImageData.height,
    };

    this.options
      .imageConverter(() => plainImageData, imageType, quality)
      .then((result) => resultTask.resolve(result))
      .catch((error) => resultTask.reject({ code: PdfErrorCode.Unknown, message: String(error) }));
  }

  // ========== Annotations ==========

  getPageAnnotations(doc: PdfDocumentObject, page: PdfPageObject): PdfTask<PdfAnnotationObject[]> {
    return this.workerQueue.enqueue(
      {
        execute: () => this.executor.getPageAnnotations(doc, page),
        meta: { docId: doc.id, pageIndex: page.index, operation: 'getPageAnnotations' },
      },
      { priority: Priority.LOW },
    );
  }

  createPageAnnotation<A extends PdfAnnotationObject>(
    doc: PdfDocumentObject,
    page: PdfPageObject,
    annotation: A,
    context?: AnnotationCreateContext<A>,
  ): PdfTask<string> {
    return this.workerQueue.enqueue(
      {
        execute: () => this.executor.createPageAnnotation(doc, page, annotation, context),
        meta: { docId: doc.id, pageIndex: page.index, operation: 'createPageAnnotation' },
      },
      { priority: Priority.LOW },
    );
  }

  updatePageAnnotation(
    doc: PdfDocumentObject,
    page: PdfPageObject,
    annotation: PdfAnnotationObject,
  ): PdfTask<boolean> {
    return this.workerQueue.enqueue(
      {
        execute: () => this.executor.updatePageAnnotation(doc, page, annotation),
        meta: { docId: doc.id, pageIndex: page.index, operation: 'updatePageAnnotation' },
      },
      { priority: Priority.LOW },
    );
  }

  removePageAnnotation(
    doc: PdfDocumentObject,
    page: PdfPageObject,
    annotation: PdfAnnotationObject,
  ): PdfTask<boolean> {
    return this.workerQueue.enqueue(
      {
        execute: () => this.executor.removePageAnnotation(doc, page, annotation),
        meta: { docId: doc.id, pageIndex: page.index, operation: 'removePageAnnotation' },
      },
      { priority: Priority.LOW },
    );
  }

  /**
   * Get all annotations across all pages
   * Orchestrates LOW priority tasks for each page
   */
  getAllAnnotations(
    doc: PdfDocumentObject,
  ): CompoundTask<Record<number, PdfAnnotationObject[]>, PdfErrorReason, PdfAnnotationsProgress> {
    const tasks = doc.pages.map((page, index) =>
      this.workerQueue.enqueue(
        {
          execute: () => this.executor.getPageAnnotations(doc, page),
          meta: { docId: doc.id, pageIndex: index, operation: 'getAnnotations' },
        },
        { priority: Priority.LOW },
      ),
    );
    return CompoundTask.gatherIndexed(tasks);
  }

  getPageTextRects(doc: PdfDocumentObject, page: PdfPageObject): PdfTask<PdfTextRectObject[]> {
    return this.workerQueue.enqueue(
      {
        execute: () => this.executor.getPageTextRects(doc, page),
        meta: { docId: doc.id, pageIndex: page.index, operation: 'getPageTextRects' },
      },
      {
        priority: Priority.LOW,
      },
    );
  }

  // ========== Search ==========

  /**
   * Search across all pages
   * Orchestrates LOW priority tasks for each page
   */
  searchAllPages(
    doc: PdfDocumentObject,
    keyword: string,
    options?: PdfSearchAllPagesOptions,
  ): PdfTask<SearchAllPagesResult, PdfPageSearchProgress> {
    const flags = Array.isArray(options?.flags)
      ? options.flags.reduce((acc, flag) => acc | flag, 0)
      : (options?.flags ?? 0);

    const tasks = doc.pages.map((page, index) =>
      this.workerQueue.enqueue(
        {
          execute: () => this.executor.searchInPage(doc, page, keyword, flags),
          meta: { docId: doc.id, pageIndex: index, operation: 'search' },
        },
        { priority: Priority.LOW },
      ),
    );

    return CompoundTask.gatherFrom(tasks, {
      aggregate: (results) => {
        const allResults = results.flat();
        return { results: allResults, total: allResults.length };
      },
      onChildComplete: (_completed, _total, results, index) => ({
        page: index,
        results,
      }),
    });
  }

  // ========== Attachments ==========

  getAttachments(doc: PdfDocumentObject): PdfTask<PdfAttachmentObject[]> {
    return this.workerQueue.enqueue(
      {
        execute: () => this.executor.getAttachments(doc),
        meta: { docId: doc.id, operation: 'getAttachments' },
      },
      { priority: Priority.LOW },
    );
  }

  addAttachment(doc: PdfDocumentObject, params: PdfAddAttachmentParams): PdfTask<boolean> {
    return this.workerQueue.enqueue(
      {
        execute: () => this.executor.addAttachment(doc, params),
        meta: { docId: doc.id, operation: 'addAttachment' },
      },
      { priority: Priority.LOW },
    );
  }

  removeAttachment(doc: PdfDocumentObject, attachment: PdfAttachmentObject): PdfTask<boolean> {
    return this.workerQueue.enqueue(
      {
        execute: () => this.executor.removeAttachment(doc, attachment),
        meta: { docId: doc.id, operation: 'removeAttachment' },
      },
      { priority: Priority.LOW },
    );
  }

  readAttachmentContent(
    doc: PdfDocumentObject,
    attachment: PdfAttachmentObject,
  ): PdfTask<ArrayBuffer> {
    return this.workerQueue.enqueue(
      {
        execute: () => this.executor.readAttachmentContent(doc, attachment),
        meta: { docId: doc.id, operation: 'readAttachmentContent' },
      },
      { priority: Priority.LOW },
    );
  }

  // ========== Forms ==========

  setFormFieldValue(
    doc: PdfDocumentObject,
    page: PdfPageObject,
    annotation: PdfWidgetAnnoObject,
    value: FormFieldValue,
  ): PdfTask<boolean> {
    return this.workerQueue.enqueue(
      {
        execute: () => this.executor.setFormFieldValue(doc, page, annotation, value),
        meta: { docId: doc.id, pageIndex: page.index, operation: 'setFormFieldValue' },
      },
      { priority: Priority.LOW },
    );
  }

  flattenPage(
    doc: PdfDocumentObject,
    page: PdfPageObject,
    options?: PdfFlattenPageOptions,
  ): PdfTask<PdfPageFlattenResult> {
    return this.workerQueue.enqueue(
      {
        execute: () => this.executor.flattenPage(doc, page, options),
        meta: { docId: doc.id, pageIndex: page.index, operation: 'flattenPage' },
      },
      { priority: Priority.LOW },
    );
  }

  // ========== Text Operations ==========

  extractPages(doc: PdfDocumentObject, pageIndexes: number[]): PdfTask<ArrayBuffer> {
    return this.workerQueue.enqueue(
      {
        execute: () => this.executor.extractPages(doc, pageIndexes),
        meta: { docId: doc.id, pageIndexes: pageIndexes, operation: 'extractPages' },
      },
      { priority: Priority.LOW },
    );
  }

  extractText(doc: PdfDocumentObject, pageIndexes: number[]): PdfTask<string> {
    return this.workerQueue.enqueue(
      {
        execute: () => this.executor.extractText(doc, pageIndexes),
        meta: { docId: doc.id, pageIndexes: pageIndexes, operation: 'extractText' },
      },
      { priority: Priority.LOW },
    );
  }

  redactTextInRects(
    doc: PdfDocumentObject,
    page: PdfPageObject,
    rects: Rect[],
    options?: PdfRedactTextOptions,
  ): PdfTask<boolean> {
    return this.workerQueue.enqueue(
      {
        execute: () => this.executor.redactTextInRects(doc, page, rects, options),
        meta: { docId: doc.id, pageIndex: page.index, operation: 'redactTextInRects' },
      },
      { priority: Priority.LOW },
    );
  }

  getTextSlices(doc: PdfDocumentObject, slices: PageTextSlice[]): PdfTask<string[]> {
    return this.workerQueue.enqueue(
      {
        execute: () => this.executor.getTextSlices(doc, slices),
        meta: { docId: doc.id, slices: slices, operation: 'getTextSlices' },
      },
      { priority: Priority.LOW },
    );
  }

  getPageGlyphs(doc: PdfDocumentObject, page: PdfPageObject): PdfTask<PdfGlyphObject[]> {
    return this.workerQueue.enqueue(
      {
        execute: () => this.executor.getPageGlyphs(doc, page),
        meta: { docId: doc.id, pageIndex: page.index, operation: 'getPageGlyphs' },
      },
      { priority: Priority.LOW },
    );
  }

  getPageGeometry(doc: PdfDocumentObject, page: PdfPageObject): PdfTask<PdfPageGeometry> {
    return this.workerQueue.enqueue(
      {
        execute: () => this.executor.getPageGeometry(doc, page),
        meta: { docId: doc.id, pageIndex: page.index, operation: 'getPageGeometry' },
      },
      { priority: Priority.LOW },
    );
  }

  // ========== Document Operations ==========

  merge(files: PdfFile[]): PdfTask<PdfFile> {
    return this.workerQueue.enqueue(
      {
        execute: () => this.executor.merge(files),
        meta: { docId: files.map((file) => file.id).join(','), operation: 'merge' },
      },
      { priority: Priority.LOW },
    );
  }

  mergePages(mergeConfigs: Array<{ docId: string; pageIndices: number[] }>): PdfTask<PdfFile> {
    return this.workerQueue.enqueue(
      {
        execute: () => this.executor.mergePages(mergeConfigs),
        meta: {
          docId: mergeConfigs.map((config) => config.docId).join(','),
          operation: 'mergePages',
        },
      },
      { priority: Priority.LOW },
    );
  }

  preparePrintDocument(doc: PdfDocumentObject, options?: PdfPrintOptions): PdfTask<ArrayBuffer> {
    return this.workerQueue.enqueue(
      {
        execute: () => this.executor.preparePrintDocument(doc, options),
        meta: { docId: doc.id, operation: 'preparePrintDocument' },
      },
      { priority: Priority.LOW },
    );
  }

  saveAsCopy(doc: PdfDocumentObject): PdfTask<ArrayBuffer> {
    return this.workerQueue.enqueue(
      {
        execute: () => this.executor.saveAsCopy(doc),
        meta: { docId: doc.id, operation: 'saveAsCopy' },
      },
      { priority: Priority.LOW },
    );
  }

  closeDocument(doc: PdfDocumentObject): PdfTask<boolean> {
    return this.workerQueue.enqueue(
      {
        execute: () => this.executor.closeDocument(doc),
        meta: { docId: doc.id, operation: 'closeDocument' },
      },
      { priority: Priority.LOW },
    );
  }

  closeAllDocuments(): PdfTask<boolean> {
    return this.workerQueue.enqueue(
      {
        execute: () => this.executor.closeAllDocuments(),
        meta: { operation: 'closeAllDocuments' },
      },
      { priority: Priority.LOW },
    );
  }
}
