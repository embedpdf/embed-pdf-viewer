import {
  BatchProgress,
  Logger,
  NoopLogger,
  PdfDocumentObject,
  PdfPageObject,
  PdfTask,
  PdfErrorReason,
  PdfFile,
  PdfOpenDocumentBufferOptions,
  PdfMetadataObject,
  PdfBookmarksObject,
  PdfBookmarkObject,
  PdfRenderPageOptions,
  PdfRenderThumbnailOptions,
  PdfRenderPageAnnotationOptions,
  PdfAnnotationObject,
  PdfTextRectObject,
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
  PdfSignatureObject,
  AnnotationCreateContext,
  Task,
  TaskError,
  PdfErrorCode,
  SearchResult,
  serializeLogger,
  IPdfiumExecutor,
  ImageDataLike,
} from '@embedpdf/models';
import type { WorkerRequest, WorkerResponse } from './pdfium-native-runner';
import type { FontFallbackConfig } from '../pdfium/font-fallback';

/**
 * Options for creating a RemoteExecutor
 */
export interface RemoteExecutorOptions {
  /**
   * URL to the pdfium.wasm file (required)
   */
  wasmUrl: string;
  /**
   * Logger instance for debugging
   */
  logger?: Logger;
  /**
   * Font fallback configuration for handling missing fonts
   */
  fontFallback?: FontFallbackConfig;
}

const LOG_SOURCE = 'RemoteExecutor';
const LOG_CATEGORY = 'Worker';

/**
 * Message types for worker communication
 */
type MessageType =
  | 'destroy'
  | 'openDocumentBuffer'
  | 'getMetadata'
  | 'setMetadata'
  | 'getDocPermissions'
  | 'getDocUserPermissions'
  | 'getSignatures'
  | 'getBookmarks'
  | 'setBookmarks'
  | 'deleteBookmarks'
  | 'renderPageRaw'
  | 'renderPageRect'
  | 'renderThumbnailRaw'
  | 'renderPageAnnotationRaw'
  | 'getPageAnnotations'
  | 'getPageAnnotationsRaw'
  | 'createPageAnnotation'
  | 'updatePageAnnotation'
  | 'removePageAnnotation'
  | 'updateAnnotationRotation'
  | 'updateAnnotationPosition'
  | 'getPageTextRects'
  | 'searchInPage'
  | 'getAnnotationsBatch'
  | 'searchBatch'
  | 'getAttachments'
  | 'addAttachment'
  | 'removeAttachment'
  | 'readAttachmentContent'
  | 'setFormFieldValue'
  | 'flattenPage'
  | 'extractPages'
  | 'extractText'
  | 'redactTextInRects'
  | 'getTextSlices'
  | 'getPageGlyphs'
  | 'getPageGeometry'
  | 'merge'
  | 'mergePages'
  | 'preparePrintDocument'
  | 'saveAsCopy'
  | 'closeDocument'
  | 'closeAllDocuments';

/**
 * RemoteExecutor - Proxy for worker communication
 *
 * This implements IPdfExecutor but forwards all calls to a Web Worker.
 * It handles:
 * - Serialization/deserialization of messages
 * - Promise/Task conversion
 * - Error handling
 * - Progress tracking
 */
export class RemoteExecutor implements IPdfiumExecutor {
  private static READY_TASK_ID = '0';
  private pendingRequests = new Map<string, Task<any, any>>();
  private requestCounter = 0;
  private logger: Logger;
  private readyTask: Task<boolean, PdfErrorReason>;

  constructor(
    private worker: Worker,
    options: RemoteExecutorOptions,
  ) {
    this.logger = options.logger ?? new NoopLogger();
    this.worker.addEventListener('message', this.handleMessage);

    // Create ready task - will be resolved when worker sends 'ready'
    this.readyTask = new Task<boolean, PdfErrorReason>();
    this.pendingRequests.set(RemoteExecutor.READY_TASK_ID, this.readyTask);

    // Send initialization message with WASM URL and font fallback config
    this.worker.postMessage({
      id: RemoteExecutor.READY_TASK_ID,
      type: 'wasmInit',
      wasmUrl: options.wasmUrl,
      logger: options.logger ? serializeLogger(options.logger) : undefined,
      fontFallback: options.fontFallback,
    });

    this.logger.debug(LOG_SOURCE, LOG_CATEGORY, 'RemoteExecutor created');
  }

  /**
   * Generate unique request ID
   */
  private generateId(): string {
    return `req-${Date.now()}-${this.requestCounter++}`;
  }

  /**
   * Send a message to the worker and return a Task
   * Waits for worker to be ready before sending
   */
  private send<T, P = unknown>(method: MessageType, args: any[]): Task<T, PdfErrorReason, P> {
    const id = this.generateId();
    const task = new Task<T, PdfErrorReason, P>();

    const request: WorkerRequest = {
      id,
      type: 'execute',
      method,
      args,
    };

    // Wait for worker to be ready before sending
    this.readyTask.wait(
      () => {
        this.pendingRequests.set(id, task);
        this.logger.debug(LOG_SOURCE, LOG_CATEGORY, `Sending ${method} request:`, id);
        this.worker.postMessage(request);
      },
      (error) => {
        this.logger.error(
          LOG_SOURCE,
          LOG_CATEGORY,
          `Worker init failed, rejecting ${method}:`,
          error,
        );
        task.reject({
          code: PdfErrorCode.Initialization,
          message: 'Worker initialization failed',
        });
      },
    );

    return task;
  }

  /**
   * Handle messages from worker
   */
  private handleMessage = (event: MessageEvent<WorkerResponse>) => {
    const response = event.data;

    // Handle ready response - resolve the readyTask
    if (response.type === 'ready') {
      this.logger.debug(LOG_SOURCE, LOG_CATEGORY, 'Worker is ready');
      this.readyTask.resolve(true);
      return;
    }

    const task = this.pendingRequests.get(response.id);

    if (!task) {
      this.logger.warn(
        LOG_SOURCE,
        LOG_CATEGORY,
        `Received response for unknown request: ${response.id}`,
      );
      return;
    }

    switch (response.type) {
      case 'result':
        this.logger.debug(LOG_SOURCE, LOG_CATEGORY, `Received result for ${response.id}`);
        task.resolve(response.data);
        this.pendingRequests.delete(response.id);
        break;

      case 'error':
        this.logger.debug(
          LOG_SOURCE,
          LOG_CATEGORY,
          `Received error for ${response.id}:`,
          response.error,
        );
        if (response.error) {
          task.fail(response.error);
        } else {
          task.reject({ code: PdfErrorCode.Unknown, message: 'Unknown error' });
        }
        this.pendingRequests.delete(response.id);
        break;

      case 'progress':
        this.logger.debug(LOG_SOURCE, LOG_CATEGORY, `Received progress for ${response.id}`);
        task.progress(response.progress);
        break;
    }
  };

  /**
   * Cleanup and terminate worker
   */
  destroy(): void {
    this.worker.removeEventListener('message', this.handleMessage);

    // Reject all pending requests (except readyTask)
    this.pendingRequests.forEach((task, id) => {
      if (id !== RemoteExecutor.READY_TASK_ID) {
        task.abort('Worker destroyed');
        this.logger.debug(LOG_SOURCE, LOG_CATEGORY, `Aborted pending request: ${id}`);
      }
    });
    this.pendingRequests.clear();

    this.worker.terminate();
    this.logger.debug(LOG_SOURCE, LOG_CATEGORY, 'RemoteExecutor destroyed');
  }

  // ========== IPdfExecutor Implementation ==========

  openDocumentBuffer(
    file: PdfFile,
    options?: PdfOpenDocumentBufferOptions,
  ): PdfTask<PdfDocumentObject> {
    return this.send<PdfDocumentObject>('openDocumentBuffer', [file, options]);
  }

  getMetadata(doc: PdfDocumentObject): PdfTask<PdfMetadataObject> {
    return this.send<PdfMetadataObject>('getMetadata', [doc]);
  }

  setMetadata(doc: PdfDocumentObject, metadata: Partial<PdfMetadataObject>): PdfTask<boolean> {
    return this.send<boolean>('setMetadata', [doc, metadata]);
  }

  getDocPermissions(doc: PdfDocumentObject): PdfTask<number> {
    return this.send<number>('getDocPermissions', [doc]);
  }

  getDocUserPermissions(doc: PdfDocumentObject): PdfTask<number> {
    return this.send<number>('getDocUserPermissions', [doc]);
  }

  getSignatures(doc: PdfDocumentObject): PdfTask<PdfSignatureObject[]> {
    return this.send<PdfSignatureObject[]>('getSignatures', [doc]);
  }

  getBookmarks(doc: PdfDocumentObject): PdfTask<PdfBookmarksObject> {
    return this.send<PdfBookmarksObject>('getBookmarks', [doc]);
  }

  setBookmarks(doc: PdfDocumentObject, bookmarks: PdfBookmarkObject[]): PdfTask<boolean> {
    return this.send<boolean>('setBookmarks', [doc, bookmarks]);
  }

  deleteBookmarks(doc: PdfDocumentObject): PdfTask<boolean> {
    return this.send<boolean>('deleteBookmarks', [doc]);
  }

  renderPageRaw(
    doc: PdfDocumentObject,
    page: PdfPageObject,
    options?: PdfRenderPageOptions,
  ): PdfTask<ImageDataLike> {
    return this.send<ImageDataLike>('renderPageRaw', [doc, page, options]);
  }

  renderPageRect(
    doc: PdfDocumentObject,
    page: PdfPageObject,
    rect: Rect,
    options?: PdfRenderPageOptions,
  ): PdfTask<ImageDataLike> {
    return this.send<ImageDataLike>('renderPageRect', [doc, page, rect, options]);
  }

  renderThumbnailRaw(
    doc: PdfDocumentObject,
    page: PdfPageObject,
    options?: PdfRenderThumbnailOptions,
  ): PdfTask<ImageDataLike> {
    return this.send<ImageDataLike>('renderThumbnailRaw', [doc, page, options]);
  }

  renderPageAnnotationRaw(
    doc: PdfDocumentObject,
    page: PdfPageObject,
    annotation: PdfAnnotationObject,
    options?: PdfRenderPageAnnotationOptions,
  ): PdfTask<ImageDataLike> {
    return this.send<ImageDataLike>('renderPageAnnotationRaw', [doc, page, annotation, options]);
  }

  getPageAnnotationsRaw(
    doc: PdfDocumentObject,
    page: PdfPageObject,
  ): PdfTask<PdfAnnotationObject[]> {
    return this.send<PdfAnnotationObject[]>('getPageAnnotationsRaw', [doc, page]);
  }

  getPageAnnotations(doc: PdfDocumentObject, page: PdfPageObject): PdfTask<PdfAnnotationObject[]> {
    return this.send<PdfAnnotationObject[]>('getPageAnnotations', [doc, page]);
  }

  createPageAnnotation<A extends PdfAnnotationObject>(
    doc: PdfDocumentObject,
    page: PdfPageObject,
    annotation: A,
    context?: AnnotationCreateContext<A>,
  ): PdfTask<string> {
    return this.send<string>('createPageAnnotation', [doc, page, annotation, context]);
  }

  updatePageAnnotation(
    doc: PdfDocumentObject,
    page: PdfPageObject,
    annotation: PdfAnnotationObject,
  ): PdfTask<boolean> {
    return this.send<boolean>('updatePageAnnotation', [doc, page, annotation]);
  }

  removePageAnnotation(
    doc: PdfDocumentObject,
    page: PdfPageObject,
    annotation: PdfAnnotationObject,
  ): PdfTask<boolean> {
    return this.send<boolean>('removePageAnnotation', [doc, page, annotation]);
  }

  updateAnnotationPosition(
    doc: PdfDocumentObject,
    page: PdfPageObject,
    annotationId: string,
    rect: Rect,
    unrotatedRect?: Rect,
  ): PdfTask<boolean> {
    return this.send<boolean>('updateAnnotationPosition', [
      doc,
      page,
      annotationId,
      rect,
      unrotatedRect,
    ]);
  }

  getPageTextRects(doc: PdfDocumentObject, page: PdfPageObject): PdfTask<PdfTextRectObject[]> {
    return this.send<PdfTextRectObject[]>('getPageTextRects', [doc, page]);
  }

  searchInPage(
    doc: PdfDocumentObject,
    page: PdfPageObject,
    keyword: string,
    flags: number,
  ): PdfTask<SearchResult[]> {
    return this.send<SearchResult[]>('searchInPage', [doc, page, keyword, flags]);
  }

  getAnnotationsBatch(
    doc: PdfDocumentObject,
    pages: PdfPageObject[],
  ): PdfTask<Record<number, PdfAnnotationObject[]>, BatchProgress<PdfAnnotationObject[]>> {
    return this.send<Record<number, PdfAnnotationObject[]>, BatchProgress<PdfAnnotationObject[]>>(
      'getAnnotationsBatch',
      [doc, pages],
    );
  }

  searchBatch(
    doc: PdfDocumentObject,
    pages: PdfPageObject[],
    keyword: string,
    flags: number,
  ): PdfTask<Record<number, SearchResult[]>, BatchProgress<SearchResult[]>> {
    return this.send<Record<number, SearchResult[]>, BatchProgress<SearchResult[]>>('searchBatch', [
      doc,
      pages,
      keyword,
      flags,
    ]);
  }

  getAttachments(doc: PdfDocumentObject): PdfTask<PdfAttachmentObject[]> {
    return this.send<PdfAttachmentObject[]>('getAttachments', [doc]);
  }

  addAttachment(doc: PdfDocumentObject, params: PdfAddAttachmentParams): PdfTask<boolean> {
    return this.send<boolean>('addAttachment', [doc, params]);
  }

  removeAttachment(doc: PdfDocumentObject, attachment: PdfAttachmentObject): PdfTask<boolean> {
    return this.send<boolean>('removeAttachment', [doc, attachment]);
  }

  readAttachmentContent(
    doc: PdfDocumentObject,
    attachment: PdfAttachmentObject,
  ): PdfTask<ArrayBuffer> {
    return this.send<ArrayBuffer>('readAttachmentContent', [doc, attachment]);
  }

  setFormFieldValue(
    doc: PdfDocumentObject,
    page: PdfPageObject,
    annotation: PdfWidgetAnnoObject,
    value: FormFieldValue,
  ): PdfTask<boolean> {
    return this.send<boolean>('setFormFieldValue', [doc, page, annotation, value]);
  }

  flattenPage(
    doc: PdfDocumentObject,
    page: PdfPageObject,
    options?: PdfFlattenPageOptions,
  ): PdfTask<PdfPageFlattenResult> {
    return this.send<PdfPageFlattenResult>('flattenPage', [doc, page, options]);
  }

  extractPages(doc: PdfDocumentObject, pageIndexes: number[]): PdfTask<ArrayBuffer> {
    return this.send<ArrayBuffer>('extractPages', [doc, pageIndexes]);
  }

  extractText(doc: PdfDocumentObject, pageIndexes: number[]): PdfTask<string> {
    return this.send<string>('extractText', [doc, pageIndexes]);
  }

  redactTextInRects(
    doc: PdfDocumentObject,
    page: PdfPageObject,
    rects: Rect[],
    options?: PdfRedactTextOptions,
  ): PdfTask<boolean> {
    return this.send<boolean>('redactTextInRects', [doc, page, rects, options]);
  }

  getTextSlices(doc: PdfDocumentObject, slices: PageTextSlice[]): PdfTask<string[]> {
    return this.send<string[]>('getTextSlices', [doc, slices]);
  }

  getPageGlyphs(doc: PdfDocumentObject, page: PdfPageObject): PdfTask<PdfGlyphObject[]> {
    return this.send<PdfGlyphObject[]>('getPageGlyphs', [doc, page]);
  }

  getPageGeometry(doc: PdfDocumentObject, page: PdfPageObject): PdfTask<PdfPageGeometry> {
    return this.send<PdfPageGeometry>('getPageGeometry', [doc, page]);
  }

  merge(files: PdfFile[]): PdfTask<PdfFile> {
    return this.send<PdfFile>('merge', [files]);
  }

  mergePages(mergeConfigs: Array<{ docId: string; pageIndices: number[] }>): PdfTask<PdfFile> {
    return this.send<PdfFile>('mergePages', [mergeConfigs]);
  }

  preparePrintDocument(doc: PdfDocumentObject, options?: PdfPrintOptions): PdfTask<ArrayBuffer> {
    return this.send<ArrayBuffer>('preparePrintDocument', [doc, options]);
  }

  saveAsCopy(doc: PdfDocumentObject): PdfTask<ArrayBuffer> {
    return this.send<ArrayBuffer>('saveAsCopy', [doc]);
  }

  closeDocument(doc: PdfDocumentObject): PdfTask<boolean> {
    return this.send<boolean>('closeDocument', [doc]);
  }

  closeAllDocuments(): PdfTask<boolean> {
    return this.send<boolean>('closeAllDocuments', []);
  }
}
