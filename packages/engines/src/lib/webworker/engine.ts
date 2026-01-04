import {
  FormFieldValue,
  PdfAttachmentObject,
  PdfFile,
  PdfMetadataObject,
  PdfSignatureObject,
  PdfTextRectObject,
  PdfWidgetAnnoObject,
  Task,
  Logger,
  NoopLogger,
  PdfAnnotationObject,
  PdfBookmarksObject,
  PdfDocumentObject,
  PdfEngine,
  PdfPageObject,
  Rect,
  PdfErrorCode,
  PdfErrorReason,
  PdfPageFlattenResult,
  SearchAllPagesResult,
  PdfFileUrl,
  PdfGlyphObject,
  PdfPageGeometry,
  PageTextSlice,
  AnnotationCreateContext,
  PdfEngineMethodArgs,
  PdfEngineMethodName,
  PdfPageSearchProgress,
  PdfRenderThumbnailOptions,
  PdfSearchAllPagesOptions,
  PdfFlattenPageOptions,
  PdfRedactTextOptions,
  PdfRenderPageAnnotationOptions,
  PdfRenderPageOptions,
  PdfOpenDocumentUrlOptions,
  PdfOpenDocumentBufferOptions,
  PdfAnnotationsProgress,
  PdfPrintOptions,
  PdfBookmarkObject,
  PdfAddAttachmentParams,
} from '@embedpdf/models';
import { ExecuteRequest, Response, SpecificExecuteRequest } from './runner';

const LOG_SOURCE = 'WebWorkerEngine';
const LOG_CATEGORY = 'Engine';

/**
 * Create a request for the webworker
 * @param id - id of the request
 * @param name - name of the method
 * @param args - arguments of the method
 * @returns request
 */
function createRequest<M extends PdfEngineMethodName>(
  id: string,
  name: M,
  args: PdfEngineMethodArgs<M>,
): SpecificExecuteRequest<M> {
  return {
    id,
    type: 'ExecuteRequest',
    data: {
      name,
      args,
    },
  };
}

/**
 * Task that executed by webworker
 */
export class WorkerTask<R, P = unknown> extends Task<R, PdfErrorReason, P> {
  /**
   * Create a task that bind to web worker with specified message id
   * @param worker - web worker instance
   * @param messageId - id of message
   *
   * @public
   */
  constructor(
    public worker: Worker,
    private messageId: string,
  ) {
    super();
  }

  /**
   * {@inheritDoc @embedpdf/models!Task.abort}
   *
   * @override
   */
  abort(e: PdfErrorReason) {
    super.abort(e);

    this.worker.postMessage({
      id: this.messageId,
      type: 'AbortRequest',
    });
  }

  /**
   * {@inheritDoc @embedpdf/models!Task.progress}
   *
   * @override
   */
  progress(p: P) {
    super.progress(p);
  }
}

/**
 * PDF engine that runs within webworker
 */
export class WebWorkerEngine implements PdfEngine {
  static readyTaskId = '0';
  /**
   * Task that represent the state of preparation
   */
  readyTask: WorkerTask<boolean>;
  /**
   * All the tasks that is executing
   */
  tasks: Map<string, WorkerTask<any>> = new Map();

  /**
   * Create an instance of WebWorkerEngine, it will create a worker with
   * specified url.
   * @param worker - webworker instance, this worker needs to contains the running instance of {@link EngineRunner}
   * @param logger - logger instance
   *
   * @public
   */
  constructor(
    private worker: Worker,
    private logger: Logger = new NoopLogger(),
  ) {
    this.worker.addEventListener('message', this.handle);

    this.readyTask = new WorkerTask<boolean>(this.worker, WebWorkerEngine.readyTaskId);
    this.tasks.set(WebWorkerEngine.readyTaskId, this.readyTask);
  }

  /**
   * Handle event from web worker. There are 2 kinds of event
   * 1. ReadyResponse: web worker is ready
   * 2. ExecuteResponse: result of execution
   * @param evt - message event from web worker
   * @returns
   *
   * @private
   */
  handle = (evt: MessageEvent<any>) => {
    this.logger.debug(
      LOG_SOURCE,
      LOG_CATEGORY,
      'webworker engine start handling message: ',
      evt.data,
    );
    try {
      const response = evt.data as Response;
      const task = this.tasks.get(response.id);
      if (!task) {
        return;
      }

      switch (response.type) {
        case 'ReadyResponse':
          this.readyTask.resolve(true);
          break;
        case 'ExecuteProgress':
          task.progress(response.data);
          break;
        case 'ExecuteResponse':
          {
            switch (response.data.type) {
              case 'result':
                task.resolve(response.data.value);
                break;
              case 'error':
                task.reject(response.data.value.reason);
                break;
            }
            this.tasks.delete(response.id);
          }
          break;
      }
    } catch (e) {
      this.logger.error(LOG_SOURCE, LOG_CATEGORY, 'webworker met error when handling message: ', e);
    }
  };

  /**
   * Generate a unique message id
   * @returns message id
   *
   * @private
   */
  generateRequestId(id: string) {
    return `${id}.${Date.now()}.${Math.random()}`;
  }

  /**
   * {@inheritDoc @embedpdf/models!PdfEngine.destroy}
   *
   * @public
   */
  destroy() {
    this.logger.debug(LOG_SOURCE, LOG_CATEGORY, 'destroy');
    const requestId = this.generateRequestId('General');
    const task = new WorkerTask<boolean>(this.worker, requestId);

    const finish = () => {
      this.worker.removeEventListener('message', this.handle);
      this.worker.terminate();
    };

    task.wait(finish, finish);

    const request: ExecuteRequest = createRequest(requestId, 'destroy', []);
    this.proxy(task, request);

    return task;
  }

  /**
   * {@inheritDoc @embedpdf/models!PdfEngine.openDocumentUrl}
   *
   * @public
   */
  openDocumentUrl(file: PdfFileUrl, options?: PdfOpenDocumentUrlOptions) {
    this.logger.debug(LOG_SOURCE, LOG_CATEGORY, 'openDocumentUrl', file.url, options);
    const requestId = this.generateRequestId(file.id);
    const task = new WorkerTask<PdfDocumentObject>(this.worker, requestId);

    const request: ExecuteRequest = createRequest(requestId, 'openDocumentUrl', [file, options]);
    this.proxy(task, request);

    return task;
  }

  /**
   * {@inheritDoc @embedpdf/models!PdfEngine.openDocument}
   *
   * @public
   */
  openDocumentBuffer(file: PdfFile, options?: PdfOpenDocumentBufferOptions) {
    this.logger.debug(LOG_SOURCE, LOG_CATEGORY, 'openDocumentBuffer', file, options);
    const requestId = this.generateRequestId(file.id);
    const task = new WorkerTask<PdfDocumentObject>(this.worker, requestId);

    const request: ExecuteRequest = createRequest(requestId, 'openDocumentBuffer', [file, options]);
    this.proxy(task, request);

    return task;
  }

  /**
   * {@inheritDoc @embedpdf/models!PdfEngine.getMetadata}
   *
   * @public
   */
  getMetadata(doc: PdfDocumentObject) {
    this.logger.debug(LOG_SOURCE, LOG_CATEGORY, 'getMetadata', doc);
    const requestId = this.generateRequestId(doc.id);
    const task = new WorkerTask<PdfMetadataObject>(this.worker, requestId);

    const request: ExecuteRequest = createRequest(requestId, 'getMetadata', [doc]);
    this.proxy(task, request);

    return task;
  }

  /**
   * {@inheritDoc @embedpdf/models!PdfEngine.setMetadata}
   *
   * @public
   */
  setMetadata(doc: PdfDocumentObject, metadata: Partial<PdfMetadataObject>) {
    this.logger.debug(LOG_SOURCE, LOG_CATEGORY, 'setMetadata', doc, metadata);
    const requestId = this.generateRequestId(doc.id);
    const task = new WorkerTask<boolean>(this.worker, requestId);

    const request: ExecuteRequest = createRequest(requestId, 'setMetadata', [doc, metadata]);
    this.proxy(task, request);

    return task;
  }

  /**
   * {@inheritDoc @embedpdf/models!PdfEngine.getDocPermissions}
   *
   * @public
   */
  getDocPermissions(doc: PdfDocumentObject) {
    this.logger.debug(LOG_SOURCE, LOG_CATEGORY, 'getDocPermissions', doc);
    const requestId = this.generateRequestId(doc.id);
    const task = new WorkerTask<number>(this.worker, requestId);

    const request: ExecuteRequest = createRequest(requestId, 'getDocPermissions', [doc]);
    this.proxy(task, request);

    return task;
  }

  /**
   * {@inheritDoc @embedpdf/models!PdfEngine.getDocUserPermissions}
   *
   * @public
   */
  getDocUserPermissions(doc: PdfDocumentObject) {
    this.logger.debug(LOG_SOURCE, LOG_CATEGORY, 'getDocUserPermissions', doc);
    const requestId = this.generateRequestId(doc.id);
    const task = new WorkerTask<number>(this.worker, requestId);

    const request: ExecuteRequest = createRequest(requestId, 'getDocUserPermissions', [doc]);
    this.proxy(task, request);

    return task;
  }

  /**
   * {@inheritDoc @embedpdf/models!PdfEngine.getBookmarks}
   *
   * @public
   */
  getBookmarks(doc: PdfDocumentObject) {
    this.logger.debug(LOG_SOURCE, LOG_CATEGORY, 'getBookmarks', doc);
    const requestId = this.generateRequestId(doc.id);
    const task = new WorkerTask<PdfBookmarksObject>(this.worker, requestId);

    const request: ExecuteRequest = createRequest(requestId, 'getBookmarks', [doc]);
    this.proxy(task, request);

    return task;
  }

  /**
   * {@inheritDoc @embedpdf/models!PdfEngine.setBookmarks}
   *
   * @public
   */
  setBookmarks(doc: PdfDocumentObject, payload: PdfBookmarkObject[]) {
    this.logger.debug(LOG_SOURCE, LOG_CATEGORY, 'setBookmarks', doc, payload);
    const requestId = this.generateRequestId(doc.id);
    const task = new WorkerTask<boolean>(this.worker, requestId);

    const request: ExecuteRequest = createRequest(requestId, 'setBookmarks', [doc, payload]);
    this.proxy(task, request);

    return task;
  }

  /**
   * {@inheritDoc @embedpdf/models!PdfEngine.deleteBookmarks}
   *
   * @public
   */
  deleteBookmarks(doc: PdfDocumentObject) {
    this.logger.debug(LOG_SOURCE, LOG_CATEGORY, 'deleteBookmarks', doc);
    const requestId = this.generateRequestId(doc.id);
    const task = new WorkerTask<boolean>(this.worker, requestId);

    const request: ExecuteRequest = createRequest(requestId, 'deleteBookmarks', [doc]);
    this.proxy(task, request);

    return task;
  }

  /**
   * {@inheritDoc @embedpdf/models!PdfEngine.getSignatures}
   *
   * @public
   */
  getSignatures(doc: PdfDocumentObject) {
    this.logger.debug(LOG_SOURCE, LOG_CATEGORY, 'getSignatures', doc);
    const requestId = this.generateRequestId(doc.id);
    const task = new WorkerTask<PdfSignatureObject[]>(this.worker, requestId);

    const request: ExecuteRequest = createRequest(requestId, 'getSignatures', [doc]);
    this.proxy(task, request);

    return task;
  }

  /**
   * {@inheritDoc @embedpdf/models!PdfEngine.renderPage}
   *
   * @public
   */
  renderPage(doc: PdfDocumentObject, page: PdfPageObject, options?: PdfRenderPageOptions) {
    this.logger.debug(LOG_SOURCE, LOG_CATEGORY, 'renderPage', doc, page, options);
    const requestId = this.generateRequestId(doc.id);
    const task = new WorkerTask<Blob>(this.worker, requestId);

    const request: ExecuteRequest = createRequest(requestId, 'renderPage', [doc, page, options]);
    this.proxy(task, request);

    return task;
  }

  /**
   * {@inheritDoc @embedpdf/models!PdfEngine.renderPageRect}
   *
   * @public
   */
  renderPageRect(
    doc: PdfDocumentObject,
    page: PdfPageObject,
    rect: Rect,
    options?: PdfRenderPageOptions,
  ) {
    this.logger.debug(LOG_SOURCE, LOG_CATEGORY, 'renderPageRect', doc, page, rect, options);
    const requestId = this.generateRequestId(doc.id);
    const task = new WorkerTask<Blob>(this.worker, requestId);

    const request: ExecuteRequest = createRequest(requestId, 'renderPageRect', [
      doc,
      page,
      rect,
      options,
    ]);
    this.proxy(task, request);

    return task;
  }

  /**
   * {@inheritDoc @embedpdf/models!PdfEngine.renderAnnotation}
   *
   * @public
   */
  renderPageAnnotation(
    doc: PdfDocumentObject,
    page: PdfPageObject,
    annotation: PdfAnnotationObject,
    options?: PdfRenderPageAnnotationOptions,
  ) {
    this.logger.debug(LOG_SOURCE, LOG_CATEGORY, 'renderAnnotation', doc, page, annotation, options);
    const requestId = this.generateRequestId(doc.id);
    const task = new WorkerTask<Blob>(this.worker, requestId);

    const request: ExecuteRequest = createRequest(requestId, 'renderPageAnnotation', [
      doc,
      page,
      annotation,
      options,
    ]);
    this.proxy(task, request);

    return task;
  }

  /**
   * {@inheritDoc @embedpdf/models!PdfEngine.getAllAnnotations}
   *
   * @public
   */
  getAllAnnotations(doc: PdfDocumentObject) {
    this.logger.debug(LOG_SOURCE, LOG_CATEGORY, 'getAllAnnotations', doc);
    const requestId = this.generateRequestId(doc.id);

    const task = new WorkerTask<Record<number, PdfAnnotationObject[]>, PdfAnnotationsProgress>(
      this.worker,
      requestId,
    );

    const request: ExecuteRequest = createRequest(requestId, 'getAllAnnotations', [doc]);
    this.proxy(task, request);

    return task;
  }

  /**
   * {@inheritDoc @embedpdf/models!PdfEngine.getPageAnnotations}
   *
   * @public
   */
  getPageAnnotations(doc: PdfDocumentObject, page: PdfPageObject) {
    this.logger.debug(LOG_SOURCE, LOG_CATEGORY, 'getPageAnnotations', doc, page);
    const requestId = this.generateRequestId(doc.id);
    const task = new WorkerTask<PdfAnnotationObject[]>(this.worker, requestId);

    const request: ExecuteRequest = createRequest(requestId, 'getPageAnnotations', [doc, page]);
    this.proxy(task, request);

    return task;
  }

  /**
   * {@inheritDoc @embedpdf/models!PdfEngine.createPageAnnotation}
   *
   * @public
   */
  createPageAnnotation<A extends PdfAnnotationObject>(
    doc: PdfDocumentObject,
    page: PdfPageObject,
    annotation: A,
    context?: AnnotationCreateContext<A>,
  ) {
    this.logger.debug(
      LOG_SOURCE,
      LOG_CATEGORY,
      'createPageAnnotations',
      doc,
      page,
      annotation,
      context,
    );
    const requestId = this.generateRequestId(doc.id);
    const task = new WorkerTask<string>(this.worker, requestId);

    const request: ExecuteRequest = createRequest(requestId, 'createPageAnnotation', [
      doc,
      page,
      annotation,
      context,
    ] as PdfEngineMethodArgs<'createPageAnnotation'>);
    this.proxy(task, request);

    return task;
  }

  updatePageAnnotation(
    doc: PdfDocumentObject,
    page: PdfPageObject,
    annotation: PdfAnnotationObject,
  ) {
    this.logger.debug(LOG_SOURCE, LOG_CATEGORY, 'updatePageAnnotation', doc, page, annotation);
    const requestId = this.generateRequestId(doc.id);
    const task = new WorkerTask<boolean>(this.worker, requestId);

    const request: ExecuteRequest = createRequest(requestId, 'updatePageAnnotation', [
      doc,
      page,
      annotation,
    ]);
    this.proxy(task, request);

    return task;
  }

  /**
   * {@inheritDoc @embedpdf/models!PdfEngine.updateAnnotationPosition}
   *
   * @public
   */
  updateAnnotationPosition(
    doc: PdfDocumentObject,
    page: PdfPageObject,
    annotationId: string,
    rect: Rect,
    unrotatedRect?: Rect,
  ) {
    this.logger.debug(
      LOG_SOURCE,
      LOG_CATEGORY,
      'updateAnnotationPosition',
      doc,
      page,
      annotationId,
      rect,
      unrotatedRect,
    );
    const requestId = this.generateRequestId(doc.id);
    const task = new WorkerTask<boolean>(this.worker, requestId);

    const request: ExecuteRequest = createRequest(requestId, 'updateAnnotationPosition', [
      doc,
      page,
      annotationId,
      rect,
      unrotatedRect,
    ]);
    this.proxy(task, request);

    return task;
  }

  /**
   * {@inheritDoc @embedpdf/models!PdfEngine.removePageAnnotation}
   *
   * @public
   */
  removePageAnnotation(
    doc: PdfDocumentObject,
    page: PdfPageObject,
    annotation: PdfAnnotationObject,
  ) {
    this.logger.debug(LOG_SOURCE, LOG_CATEGORY, 'removePageAnnotations', doc, page, annotation);
    const requestId = this.generateRequestId(doc.id);
    const task = new WorkerTask<boolean>(this.worker, requestId);

    const request: ExecuteRequest = createRequest(requestId, 'removePageAnnotation', [
      doc,
      page,
      annotation,
    ]);
    this.proxy(task, request);

    return task;
  }

  /**
   * {@inheritDoc @embedpdf/models!PdfEngine.getPageTextRects}
   *
   * @public
   */
  getPageTextRects(doc: PdfDocumentObject, page: PdfPageObject) {
    this.logger.debug(LOG_SOURCE, LOG_CATEGORY, 'getPageTextRects', doc, page);
    const requestId = this.generateRequestId(doc.id);
    const task = new WorkerTask<PdfTextRectObject[]>(this.worker, requestId);

    const request: ExecuteRequest = createRequest(requestId, 'getPageTextRects', [doc, page]);
    this.proxy(task, request);

    return task;
  }

  /**
   * {@inheritDoc @embedpdf/models!PdfEngine.renderThumbnail}
   *
   * @public
   */
  renderThumbnail(
    doc: PdfDocumentObject,
    page: PdfPageObject,
    options?: PdfRenderThumbnailOptions,
  ) {
    this.logger.debug(LOG_SOURCE, LOG_CATEGORY, 'renderThumbnail', doc, page, options);
    const requestId = this.generateRequestId(doc.id);
    const task = new WorkerTask<Blob>(this.worker, requestId);

    const request: ExecuteRequest = createRequest(requestId, 'renderThumbnail', [
      doc,
      page,
      options,
    ]);
    this.proxy(task, request);

    return task;
  }

  /**
   * {@inheritDoc @embedpdf/models!PdfEngine.searchAllPages}
   *
   * @public
   */
  searchAllPages(doc: PdfDocumentObject, keyword: string, options?: PdfSearchAllPagesOptions) {
    this.logger.debug(LOG_SOURCE, LOG_CATEGORY, 'searchAllPages', doc, keyword, options);

    const requestId = this.generateRequestId(doc.id);
    const task = new WorkerTask<SearchAllPagesResult, PdfPageSearchProgress>(
      this.worker,
      requestId,
    );

    const request: ExecuteRequest = createRequest(requestId, 'searchAllPages', [
      doc,
      keyword,
      options,
    ]);

    this.proxy(task, request);
    return task;
  }

  /**
   * {@inheritDoc @embedpdf/models!PdfEngine.saveAsCopy}
   *
   * @public
   */
  saveAsCopy(doc: PdfDocumentObject) {
    this.logger.debug(LOG_SOURCE, LOG_CATEGORY, 'saveAsCopy', doc);
    const requestId = this.generateRequestId(doc.id);
    const task = new WorkerTask<ArrayBuffer>(this.worker, requestId);

    const request: ExecuteRequest = createRequest(requestId, 'saveAsCopy', [doc]);
    this.proxy(task, request);

    return task;
  }

  /**
   * {@inheritDoc @embedpdf/models!PdfEngine.getAttachments}
   *
   * @public
   */
  getAttachments(doc: PdfDocumentObject) {
    this.logger.debug(LOG_SOURCE, LOG_CATEGORY, 'getAttachments', doc);
    const requestId = this.generateRequestId(doc.id);
    const task = new WorkerTask<PdfAttachmentObject[]>(this.worker, requestId);

    const request: ExecuteRequest = createRequest(requestId, 'getAttachments', [doc]);
    this.proxy(task, request);

    return task;
  }

  /**
   * {@inheritDoc @embedpdf/models!PdfEngine.addAttachment}
   *
   * @public
   */
  addAttachment(doc: PdfDocumentObject, params: PdfAddAttachmentParams) {
    this.logger.debug(LOG_SOURCE, LOG_CATEGORY, 'addAttachment', doc, params);
    const requestId = this.generateRequestId(doc.id);
    const task = new WorkerTask<boolean>(this.worker, requestId);

    const request: ExecuteRequest = createRequest(requestId, 'addAttachment', [doc, params]);
    this.proxy(task, request);

    return task;
  }

  /**
   * {@inheritDoc @embedpdf/models!PdfEngine.removeAttachment}
   *
   * @public
   */
  removeAttachment(doc: PdfDocumentObject, attachment: PdfAttachmentObject) {
    this.logger.debug(LOG_SOURCE, LOG_CATEGORY, 'removeAttachment', doc, attachment);
    const requestId = this.generateRequestId(doc.id);
    const task = new WorkerTask<boolean>(this.worker, requestId);

    const request: ExecuteRequest = createRequest(requestId, 'removeAttachment', [doc, attachment]);
    this.proxy(task, request);

    return task;
  }

  /**
   * {@inheritDoc @embedpdf/models!PdfEngine.readAttachmentContent}
   *
   * @public
   */
  readAttachmentContent(doc: PdfDocumentObject, attachment: PdfAttachmentObject) {
    this.logger.debug(LOG_SOURCE, LOG_CATEGORY, 'readAttachmentContent', doc, attachment);
    const requestId = this.generateRequestId(doc.id);
    const task = new WorkerTask<ArrayBuffer>(this.worker, requestId);

    const request: ExecuteRequest = createRequest(requestId, 'readAttachmentContent', [
      doc,
      attachment,
    ]);
    this.proxy(task, request);

    return task;
  }

  /**
   * {@inheritDoc @embedpdf/models!PdfEngine.setFormFieldValue}
   *
   * @public
   */
  setFormFieldValue(
    doc: PdfDocumentObject,
    page: PdfPageObject,
    annotation: PdfWidgetAnnoObject,
    value: FormFieldValue,
  ) {
    this.logger.debug(LOG_SOURCE, LOG_CATEGORY, 'setFormFieldValue', doc, annotation, value);
    const requestId = this.generateRequestId(doc.id);
    const task = new WorkerTask<boolean>(this.worker, requestId);

    const request: ExecuteRequest = createRequest(requestId, 'setFormFieldValue', [
      doc,
      page,
      annotation,
      value,
    ]);
    this.proxy(task, request);

    return task;
  }

  /**
   * {@inheritDoc @embedpdf/models!PdfEngine.flattenPage}
   *
   * @public
   */
  flattenPage(doc: PdfDocumentObject, page: PdfPageObject, options?: PdfFlattenPageOptions) {
    this.logger.debug(LOG_SOURCE, LOG_CATEGORY, 'flattenPage', doc, page, options);
    const requestId = this.generateRequestId(doc.id);
    const task = new WorkerTask<PdfPageFlattenResult>(this.worker, requestId);

    const request: ExecuteRequest = createRequest(requestId, 'flattenPage', [doc, page, options]);
    this.proxy(task, request);

    return task;
  }

  /**
   * {@inheritDoc @embedpdf/models!PdfEngine.extractPages}
   *
   * @public
   */
  extractPages(doc: PdfDocumentObject, pageIndexes: number[]) {
    this.logger.debug(LOG_SOURCE, LOG_CATEGORY, 'extractPages', doc);
    const requestId = this.generateRequestId(doc.id);
    const task = new WorkerTask<ArrayBuffer>(this.worker, requestId);

    const request: ExecuteRequest = createRequest(requestId, 'extractPages', [doc, pageIndexes]);
    this.proxy(task, request);

    return task;
  }

  /**
   * {@inheritDoc @embedpdf/models!PdfEngine.redactTextInQuads}
   *
   * @public
   */
  redactTextInRects(
    doc: PdfDocumentObject,
    page: PdfPageObject,
    rects: Rect[],
    options?: PdfRedactTextOptions,
  ) {
    this.logger.debug(LOG_SOURCE, LOG_CATEGORY, 'redactTextInRects', doc, page, rects, options);
    const requestId = this.generateRequestId(doc.id);
    const task = new WorkerTask<boolean>(this.worker, requestId);

    const request: ExecuteRequest = createRequest(requestId, 'redactTextInRects', [
      doc,
      page,
      rects,
      options,
    ]);
    this.proxy(task, request);

    return task;
  }

  /**
   * {@inheritDoc @embedpdf/models!PdfEngine.extractText}
   *
   * @public
   */
  extractText(doc: PdfDocumentObject, pageIndexes: number[]) {
    this.logger.debug(LOG_SOURCE, LOG_CATEGORY, 'extractText', doc);
    const requestId = this.generateRequestId(doc.id);
    const task = new WorkerTask<string>(this.worker, requestId);

    const request: ExecuteRequest = createRequest(requestId, 'extractText', [doc, pageIndexes]);
    this.proxy(task, request);

    return task;
  }

  /**
   * {@inheritDoc @embedpdf/models!PdfEngine.getTextSlices}
   *
   * @public
   */
  getTextSlices(doc: PdfDocumentObject, slices: PageTextSlice[]) {
    this.logger.debug(LOG_SOURCE, LOG_CATEGORY, 'getTextSlices', doc, slices);
    const requestId = this.generateRequestId(doc.id);
    const task = new WorkerTask<string[]>(this.worker, requestId);

    const request: ExecuteRequest = createRequest(requestId, 'getTextSlices', [doc, slices]);
    this.proxy(task, request);

    return task;
  }

  /**
   * {@inheritDoc @embedpdf/models!PdfEngine.getPageGlyphs}
   *
   * @public
   */
  getPageGlyphs(doc: PdfDocumentObject, page: PdfPageObject) {
    this.logger.debug(LOG_SOURCE, LOG_CATEGORY, 'getPageGlyphs', doc, page);
    const requestId = this.generateRequestId(doc.id);
    const task = new WorkerTask<PdfGlyphObject[]>(this.worker, requestId);

    const request: ExecuteRequest = createRequest(requestId, 'getPageGlyphs', [doc, page]);
    this.proxy(task, request);

    return task;
  }

  /**
   * {@inheritDoc @embedpdf/models!PdfEngine.getPageGeometry}
   *
   * @public
   */
  getPageGeometry(doc: PdfDocumentObject, page: PdfPageObject) {
    this.logger.debug(LOG_SOURCE, LOG_CATEGORY, 'getPageGeometry', doc, page);
    const requestId = this.generateRequestId(doc.id);
    const task = new WorkerTask<PdfPageGeometry>(this.worker, requestId);

    const request: ExecuteRequest = createRequest(requestId, 'getPageGeometry', [doc, page]);
    this.proxy(task, request);

    return task;
  }

  /**
   * {@inheritDoc @embedpdf/models!PdfEngine.merge}
   *
   * @public
   */
  merge(files: PdfFile[]) {
    this.logger.debug(LOG_SOURCE, LOG_CATEGORY, 'merge', files);
    const fileIds = files.map((file) => file.id).join('.');
    const requestId = this.generateRequestId(fileIds);
    const task = new WorkerTask<PdfFile>(this.worker, requestId);

    const request: ExecuteRequest = createRequest(requestId, 'merge', [files]);
    this.proxy(task, request);

    return task;
  }

  /**
   * {@inheritDoc @embedpdf/models!PdfEngine.mergePages}
   *
   * @public
   */
  mergePages(mergeConfigs: Array<{ docId: string; pageIndices: number[] }>) {
    this.logger.debug(LOG_SOURCE, LOG_CATEGORY, 'mergePages', mergeConfigs);
    const requestId = this.generateRequestId(mergeConfigs.map((config) => config.docId).join('.'));
    const task = new WorkerTask<PdfFile>(this.worker, requestId);

    const request: ExecuteRequest = createRequest(requestId, 'mergePages', [mergeConfigs]);
    this.proxy(task, request);

    return task;
  }

  /**
   * {@inheritDoc @embedpdf/models!PdfEngine.preparePrintDocument}
   *
   * @public
   */
  preparePrintDocument(doc: PdfDocumentObject, options?: PdfPrintOptions) {
    this.logger.debug(LOG_SOURCE, LOG_CATEGORY, 'preparePrintDocument', doc, options);
    const requestId = this.generateRequestId(doc.id);
    const task = new WorkerTask<ArrayBuffer>(this.worker, requestId);

    const request: ExecuteRequest = createRequest(requestId, 'preparePrintDocument', [
      doc,
      options,
    ]);
    this.proxy(task, request);

    return task;
  }

  /**
   * {@inheritDoc @embedpdf/models!PdfEngine.closeDocument}
   *
   * @public
   */
  closeDocument(doc: PdfDocumentObject) {
    this.logger.debug(LOG_SOURCE, LOG_CATEGORY, 'closeDocument', doc);
    const requestId = this.generateRequestId(doc.id);
    const task = new WorkerTask<boolean>(this.worker, requestId);

    const request: ExecuteRequest = createRequest(requestId, 'closeDocument', [doc]);
    this.proxy(task, request);

    return task;
  }

  /**
   * {@inheritDoc @embedpdf/models!PdfEngine.closeAllDocuments}
   *
   * @public
   */
  closeAllDocuments() {
    this.logger.debug(LOG_SOURCE, LOG_CATEGORY, 'closeAllDocuments');
    const requestId = this.generateRequestId('closeAllDocuments');
    const task = new WorkerTask<boolean>(this.worker, requestId);
    const request: ExecuteRequest = createRequest(requestId, 'closeAllDocuments', []);
    this.proxy(task, request);

    return task;
  }

  /**
   * Send the request to webworker inside and register the task
   * @param task - task that waiting for the response
   * @param request - request that needs send to web worker
   * @param transferables - transferables that need to transfer to webworker
   * @returns
   *
   * @internal
   */
  proxy<R>(task: WorkerTask<R>, request: ExecuteRequest, transferables: any[] = []) {
    this.logger.debug(
      LOG_SOURCE,
      LOG_CATEGORY,
      'send request to worker',
      task,
      request,
      transferables,
    );
    this.logger.perf(LOG_SOURCE, LOG_CATEGORY, `${request.data.name}`, 'Begin', request.id);
    this.readyTask.wait(
      () => {
        this.worker.postMessage(request, transferables);
        task.wait(
          () => {
            this.logger.perf(LOG_SOURCE, LOG_CATEGORY, `${request.data.name}`, 'End', request.id);
          },
          () => {
            this.logger.perf(LOG_SOURCE, LOG_CATEGORY, `${request.data.name}`, 'End', request.id);
          },
        );
        this.tasks.set(request.id, task);
      },
      () => {
        this.logger.perf(LOG_SOURCE, LOG_CATEGORY, `${request.data.name}`, 'End', request.id);
        task.reject({
          code: PdfErrorCode.Initialization,
          message: 'worker initialization failed',
        });
      },
    );
  }
}
