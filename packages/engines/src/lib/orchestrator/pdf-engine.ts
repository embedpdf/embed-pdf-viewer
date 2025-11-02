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
} from '@embedpdf/models';
import { ImageEncoderWorkerPool } from '../image-encoder';
import { WorkerTaskQueue, Priority } from './task-queue';

const LOG_SOURCE = 'PdfEngine';
const LOG_CATEGORY = 'Orchestrator';

/**
 * Image data type that matches both ImageData and plain objects
 */
export type ImageDataLike = {
  data: Uint8ClampedArray;
  width: number;
  height: number;
  colorSpace?: PredefinedColorSpace;
};

/**
 * Image data converter function type
 */
export type ImageDataConverter<T> = (
  imageDataFn: () => { data: Uint8ClampedArray; width: number; height: number },
  imageType?: 'image/png' | 'image/jpeg' | 'image/webp',
  quality?: number,
) => Promise<T>;

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
  openDocumentFromLoader(fileLoader: any, password?: string): PdfTask<PdfDocumentObject>;
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
  imageConverter?: ImageDataConverter<T>;
  /**
   * Fetch function for fetching remote URLs
   */
  fetcher?: typeof fetch;
  /**
   * Logger instance
   */
  logger?: Logger;
  /**
   * Image encoder worker pool (optional, for parallel encoding)
   */
  encoderPool?: ImageEncoderWorkerPool;
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
  private encoderQueue?: WorkerTaskQueue;
  private logger: Logger;
  private options: Required<Omit<PdfEngineOptions<T>, 'encoderPool'>> & {
    encoderPool?: ImageEncoderWorkerPool;
  };

  constructor(executor: IPdfExecutor, options: PdfEngineOptions<T> = {}) {
    this.executor = executor;
    this.logger = options.logger ?? new NoopLogger();
    this.options = {
      imageConverter: options.imageConverter as any,
      fetcher: options.fetcher ?? (typeof fetch !== 'undefined' ? fetch : (undefined as any)),
      logger: this.logger,
      encoderPool: options.encoderPool,
    };

    // Create worker queue with single concurrency (PDFium is single-threaded)
    this.workerQueue = new WorkerTaskQueue({
      concurrency: 1,
      autoStart: true,
    });

    // Create encoder queue with higher concurrency if encoder pool is available
    if (options.encoderPool) {
      this.encoderQueue = new WorkerTaskQueue({
        concurrency: options.encoderPool.activeWorkers,
        autoStart: true,
      });
    }

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
      this.options.encoderPool?.destroy();
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
        const response = await this.options.fetcher(file.url, {
          headers: options?.headers ?? {},
        });
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
    return this.executor.openDocumentBuffer(file, options);
  }

  getMetadata(doc: PdfDocumentObject): PdfTask<PdfMetadataObject> {
    return this.executor.getMetadata(doc);
  }

  setMetadata(doc: PdfDocumentObject, metadata: Partial<PdfMetadataObject>): PdfTask<boolean> {
    return this.executor.setMetadata(doc, metadata);
  }

  getDocPermissions(doc: PdfDocumentObject): PdfTask<number> {
    return this.executor.getDocPermissions(doc);
  }

  getDocUserPermissions(doc: PdfDocumentObject): PdfTask<number> {
    return this.executor.getDocUserPermissions(doc);
  }

  getSignatures(doc: PdfDocumentObject): PdfTask<PdfSignatureObject[]> {
    return this.executor.getSignatures(doc);
  }

  getBookmarks(doc: PdfDocumentObject): PdfTask<PdfBookmarksObject> {
    return this.executor.getBookmarks(doc);
  }

  setBookmarks(doc: PdfDocumentObject, bookmarks: PdfBookmarkObject[]): PdfTask<boolean> {
    return this.executor.setBookmarks(doc, bookmarks);
  }

  deleteBookmarks(doc: PdfDocumentObject): PdfTask<boolean> {
    return this.executor.deleteBookmarks(doc);
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
      page.index,
      Priority.HIGH,
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
      page.index,
      Priority.MEDIUM,
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
      page.index,
      Priority.HIGH,
    );
  }

  /**
   * Helper to render and encode in two stages with priority queue
   */
  private renderWithEncoding(
    renderFn: () => PdfTask<ImageDataLike>,
    options?: PdfRenderPageOptions | PdfRenderThumbnailOptions | PdfRenderPageAnnotationOptions,
    pageIndex?: number,
    priority: Priority = Priority.HIGH,
  ): PdfTask<T> {
    const resultTask = new Task<T, PdfErrorReason>();

    // Step 1: Add HIGH/MEDIUM priority task to render raw bytes
    const renderHandle = this.workerQueue.enqueue<ImageDataLike, PdfErrorReason>(
      {
        execute: async () => {
          const task = renderFn();
          return task.toPromise();
        },
        meta: { pageIndex, operation: 'render' },
      },
      { priority },
    );

    renderHandle.task.wait(
      (rawImageData) => {
        // Step 2: Add task to encode image
        const converter = this.options.imageConverter;
        if (converter) {
          this.encodeImage(rawImageData, options, resultTask);
        } else {
          // No converter, return raw data
          resultTask.resolve(rawImageData as any);
        }
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

    if (this.encoderQueue && this.options.encoderPool) {
      // Use encoder pool for parallel encoding
      const encodeHandle = this.encoderQueue.enqueue<T, PdfErrorReason>(
        {
          execute: async () => {
            const blob = await this.options.encoderPool!.encode(plainImageData, imageType, quality);
            return blob as T;
          },
        },
        { priority: Priority.HIGH },
      );

      encodeHandle.task.wait(
        (blob) => resultTask.resolve(blob),
        (error) => resultTask.fail(error),
      );
    } else if (this.options.imageConverter) {
      // Use inline converter
      this.options
        .imageConverter(() => plainImageData, imageType, quality)
        .then((result) => resultTask.resolve(result))
        .catch((error) =>
          resultTask.reject({ code: PdfErrorCode.Unknown, message: String(error) }),
        );
    } else {
      resultTask.resolve(rawImageData as any);
    }
  }

  // ========== Annotations ==========

  getPageAnnotations(doc: PdfDocumentObject, page: PdfPageObject): PdfTask<PdfAnnotationObject[]> {
    return this.executor.getPageAnnotations(doc, page);
  }

  createPageAnnotation<A extends PdfAnnotationObject>(
    doc: PdfDocumentObject,
    page: PdfPageObject,
    annotation: A,
    context?: AnnotationCreateContext<A>,
  ): PdfTask<string> {
    return this.executor.createPageAnnotation(doc, page, annotation, context);
  }

  updatePageAnnotation(
    doc: PdfDocumentObject,
    page: PdfPageObject,
    annotation: PdfAnnotationObject,
  ): PdfTask<boolean> {
    return this.executor.updatePageAnnotation(doc, page, annotation);
  }

  removePageAnnotation(
    doc: PdfDocumentObject,
    page: PdfPageObject,
    annotation: PdfAnnotationObject,
  ): PdfTask<boolean> {
    return this.executor.removePageAnnotation(doc, page, annotation);
  }

  /**
   * Get all annotations across all pages
   * Orchestrates LOW priority tasks for each page
   */
  getAllAnnotations(
    doc: PdfDocumentObject,
  ): PdfTask<Record<number, PdfAnnotationObject[]>, PdfAnnotationsProgress> {
    const task = new Task<
      Record<number, PdfAnnotationObject[]>,
      PdfErrorReason,
      PdfAnnotationsProgress
    >();
    const allAnnotations: Record<number, PdfAnnotationObject[]> = {};
    let completed = 0;

    for (let i = 0; i < doc.pageCount; i++) {
      const pageIndex = i;

      this.workerQueue
        .enqueue<PdfAnnotationObject[], PdfErrorReason>(
          {
            execute: async () => {
              const annotTask = this.executor.getPageAnnotations(doc, doc.pages[pageIndex]);
              return annotTask.toPromise();
            },
            meta: { pageIndex, operation: 'getAnnotations' },
          },
          { priority: Priority.LOW },
        )
        .task.wait(
          (annotations) => {
            allAnnotations[pageIndex] = annotations;
            completed++;

            task.progress({ page: pageIndex, annotations });

            if (completed === doc.pageCount) {
              task.resolve(allAnnotations);
            }
          },
          (error) => {
            task.fail(error);
          },
        );
    }

    return task;
  }

  getPageTextRects(doc: PdfDocumentObject, page: PdfPageObject): PdfTask<PdfTextRectObject[]> {
    return this.executor.getPageTextRects(doc, page);
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
    const task = new Task<SearchAllPagesResult, PdfErrorReason, PdfPageSearchProgress>();
    const allResults: SearchResult[] = [];
    let completed = 0;

    for (let i = 0; i < doc.pageCount; i++) {
      const pageIndex = i;

      this.workerQueue
        .enqueue<SearchResult[], PdfErrorReason>(
          {
            execute: async () => {
              // Convert flags array to number
              const flags = Array.isArray(options?.flags)
                ? options.flags.reduce((acc, flag) => acc | flag, 0)
                : (options?.flags ?? 0);

              const searchTask = this.executor.searchInPage(
                doc,
                doc.pages[pageIndex],
                keyword,
                flags,
              );
              return searchTask.toPromise();
            },
            meta: { pageIndex, operation: 'search' },
          },
          { priority: Priority.LOW },
        )
        .task.wait(
          (pageResults) => {
            allResults.push(...pageResults);
            completed++;

            task.progress({ page: pageIndex, results: pageResults });

            if (completed === doc.pageCount) {
              task.resolve({ results: allResults, total: allResults.length });
            }
          },
          (error) => {
            task.fail(error);
          },
        );
    }

    return task;
  }

  // ========== Attachments ==========

  getAttachments(doc: PdfDocumentObject): PdfTask<PdfAttachmentObject[]> {
    return this.executor.getAttachments(doc);
  }

  addAttachment(doc: PdfDocumentObject, params: PdfAddAttachmentParams): PdfTask<boolean> {
    return this.executor.addAttachment(doc, params);
  }

  removeAttachment(doc: PdfDocumentObject, attachment: PdfAttachmentObject): PdfTask<boolean> {
    return this.executor.removeAttachment(doc, attachment);
  }

  readAttachmentContent(
    doc: PdfDocumentObject,
    attachment: PdfAttachmentObject,
  ): PdfTask<ArrayBuffer> {
    return this.executor.readAttachmentContent(doc, attachment);
  }

  // ========== Forms ==========

  setFormFieldValue(
    doc: PdfDocumentObject,
    page: PdfPageObject,
    annotation: PdfWidgetAnnoObject,
    value: FormFieldValue,
  ): PdfTask<boolean> {
    return this.executor.setFormFieldValue(doc, page, annotation, value);
  }

  flattenPage(
    doc: PdfDocumentObject,
    page: PdfPageObject,
    options?: PdfFlattenPageOptions,
  ): PdfTask<PdfPageFlattenResult> {
    return this.executor.flattenPage(doc, page, options);
  }

  // ========== Text Operations ==========

  extractPages(doc: PdfDocumentObject, pageIndexes: number[]): PdfTask<ArrayBuffer> {
    return this.executor.extractPages(doc, pageIndexes);
  }

  extractText(doc: PdfDocumentObject, pageIndexes: number[]): PdfTask<string> {
    return this.executor.extractText(doc, pageIndexes);
  }

  redactTextInRects(
    doc: PdfDocumentObject,
    page: PdfPageObject,
    rects: Rect[],
    options?: PdfRedactTextOptions,
  ): PdfTask<boolean> {
    return this.executor.redactTextInRects(doc, page, rects, options);
  }

  getTextSlices(doc: PdfDocumentObject, slices: PageTextSlice[]): PdfTask<string[]> {
    return this.executor.getTextSlices(doc, slices);
  }

  getPageGlyphs(doc: PdfDocumentObject, page: PdfPageObject): PdfTask<PdfGlyphObject[]> {
    return this.executor.getPageGlyphs(doc, page);
  }

  getPageGeometry(doc: PdfDocumentObject, page: PdfPageObject): PdfTask<PdfPageGeometry> {
    return this.executor.getPageGeometry(doc, page);
  }

  // ========== Document Operations ==========

  merge(files: PdfFile[]): PdfTask<PdfFile> {
    return this.executor.merge(files);
  }

  mergePages(mergeConfigs: Array<{ docId: string; pageIndices: number[] }>): PdfTask<PdfFile> {
    return this.executor.mergePages(mergeConfigs);
  }

  preparePrintDocument(doc: PdfDocumentObject, options?: PdfPrintOptions): PdfTask<ArrayBuffer> {
    return this.executor.preparePrintDocument(doc, options);
  }

  saveAsCopy(doc: PdfDocumentObject): PdfTask<ArrayBuffer> {
    return this.executor.saveAsCopy(doc);
  }

  closeDocument(doc: PdfDocumentObject): PdfTask<boolean> {
    return this.executor.closeDocument(doc);
  }

  closeAllDocuments(): PdfTask<boolean> {
    return this.executor.closeAllDocuments();
  }
}
