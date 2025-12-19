import {
  Logger,
  NoopLogger,
  PdfEngine,
  PdfEngineError,
  PdfEngineMethodArgs,
  PdfEngineMethodName,
  PdfEngineMethodReturnType,
  PdfErrorCode,
  TaskReturn,
} from '@embedpdf/models';

/**
 * Request body that represent method calls of PdfEngine, it contains the
 * method name and arguments
 */
export type PdfEngineMethodRequestBody = {
  [P in PdfEngineMethodName]: {
    name: P;
    args: PdfEngineMethodArgs<P>;
  };
}[PdfEngineMethodName];

/**
 * Request body that represent method calls of PdfEngine, it contains the
 * method name and arguments
 */
export type SpecificExecuteRequest<M extends PdfEngineMethodName> = {
  id: string;
  type: 'ExecuteRequest';
  data: {
    name: M;
    args: PdfEngineMethodArgs<M>;
  };
};

/**
 * Response body that represent return value of PdfEngine
 */
export type PdfEngineMethodResponseBody = {
  [P in PdfEngineMethodName]: TaskReturn<PdfEngineMethodReturnType<P>>;
}[PdfEngineMethodName];

/**
 * Request that abort the specified task
 */
export interface AbortRequest {
  /**
   * message id
   */
  id: string;
  /**
   * request type
   */
  type: 'AbortRequest';
}
/**
 * Request that execute pdf engine method
 */
export interface ExecuteRequest {
  /**
   * message id
   */
  id: string;
  /**
   * request type
   */
  type: 'ExecuteRequest';
  /**
   * request body
   */
  data: PdfEngineMethodRequestBody;
}
/**
 * Response that execute pdf engine method
 */
export interface ExecuteResponse {
  /**
   * message id
   */
  id: string;
  /**
   * response type
   */
  type: 'ExecuteResponse';
  /**
   * response body
   */
  data: PdfEngineMethodResponseBody;
}

/**
 * Response that indicate progress of the task
 */
export interface ExecuteProgress<T = unknown> {
  /**
   * message id
   */
  id: string;
  /**
   * response type
   */
  type: 'ExecuteProgress';
  /**
   * response body
   */
  data: T;
}

/**
 * Response that indicate engine is ready
 */
export interface ReadyResponse {
  /**
   * message id
   */
  id: string;
  /**
   * response type
   */
  type: 'ReadyResponse';
}

/**
 * Request type
 */
export type Request = ExecuteRequest | AbortRequest;
/**
 * Response type
 */
export type Response = ExecuteResponse | ReadyResponse | ExecuteProgress;

const LOG_SOURCE = 'WebWorkerEngineRunner';
const LOG_CATEGORY = 'Engine';

/**
 * Pdf engine runner, it will execute pdf engine based on the request it received and
 * send back the response with post message
 */
export class EngineRunner {
  engine: PdfEngine | undefined;

  /**
   * Create instance of EngineRunnder
   * @param logger - logger instance
   */
  constructor(public logger: Logger = new NoopLogger()) {}

  /**
   * Listening on post message
   */
  listen() {
    self.onmessage = (evt: MessageEvent<Request>) => {
      return this.handle(evt);
    };
  }

  /**
   * Handle post message
   */
  handle(evt: MessageEvent<Request>) {
    this.logger.debug(LOG_SOURCE, LOG_CATEGORY, 'webworker receive message event: ', evt.data);
    try {
      const request = evt.data as Request;
      switch (request.type) {
        case 'ExecuteRequest':
          this.execute(request);
          break;
      }
    } catch (e) {
      this.logger.info(
        LOG_SOURCE,
        LOG_CATEGORY,
        'webworker met error when processing message event:',
        e,
      );
    }
  }

  /**
   * Send the ready response when pdf engine is ready
   * @returns
   *
   * @protected
   */
  ready() {
    this.listen();

    this.respond({
      id: '0',
      type: 'ReadyResponse',
    });
    this.logger.debug(LOG_SOURCE, LOG_CATEGORY, 'runner is ready');
  }

  /**
   * Execute the request
   * @param request - request that represent the pdf engine call
   * @returns
   *
   * @protected
   */
  execute = async (request: ExecuteRequest) => {
    this.logger.debug(LOG_SOURCE, LOG_CATEGORY, 'runner start exeucte request');
    if (!this.engine) {
      const error: PdfEngineError = {
        type: 'reject',
        reason: {
          code: PdfErrorCode.NotReady,
          message: 'engine has not started yet',
        },
      };
      const response: ExecuteResponse = {
        id: request.id,
        type: 'ExecuteResponse',
        data: {
          type: 'error',
          value: error,
        },
      };
      this.respond(response);
      return;
    }

    const engine = this.engine;
    const { name, args } = request.data;
    if (!engine[name]) {
      const error: PdfEngineError = {
        type: 'reject',
        reason: {
          code: PdfErrorCode.NotSupport,
          message: `engine method ${name} is not supported yet`,
        },
      };
      const response: ExecuteResponse = {
        id: request.id,
        type: 'ExecuteResponse',
        data: {
          type: 'error',
          value: error,
        },
      };
      this.respond(response);
      return;
    }

    let task: PdfEngineMethodReturnType<typeof name>;
    switch (name) {
      case 'isSupport':
        task = this.engine[name]!(...args);
        break;
      case 'destroy':
        task = this.engine[name]!(...args);
        break;
      case 'openDocumentUrl':
        task = this.engine[name]!(...args);
        break;
      case 'openDocumentBuffer':
        task = this.engine[name]!(...args);
        break;
      case 'getDocPermissions':
        task = this.engine[name]!(...args);
        break;
      case 'getDocUserPermissions':
        task = this.engine[name]!(...args);
        break;
      case 'getMetadata':
        task = this.engine[name]!(...args);
        break;
      case 'setMetadata':
        task = this.engine[name]!(...args);
        break;
      case 'getBookmarks':
        task = this.engine[name]!(...args);
        break;
      case 'setBookmarks':
        task = this.engine[name]!(...args);
        break;
      case 'deleteBookmarks':
        task = this.engine[name]!(...args);
        break;
      case 'getSignatures':
        task = this.engine[name]!(...args);
        break;
      case 'renderPage':
        task = this.engine[name]!(...args);
        break;
      case 'renderPageRect':
        task = this.engine[name]!(...args);
        break;
      case 'renderPageAnnotation':
        task = this.engine[name]!(...args);
        break;
      case 'renderThumbnail':
        task = this.engine[name]!(...args);
        break;
      case 'getAllAnnotations':
        task = this.engine[name]!(...args);
        break;
      case 'getPageAnnotations':
        task = this.engine[name]!(...args);
        break;
      case 'createPageAnnotation':
        task = this.engine[name]!(...args);
        break;
      case 'updatePageAnnotation':
        task = this.engine[name]!(...args);
        break;
      case 'removePageAnnotation':
        task = this.engine[name]!(...args);
        break;
      case 'getPageTextRects':
        task = this.engine[name]!(...args);
        break;
      case 'searchAllPages':
        task = this.engine[name]!(...args);
        break;
      case 'closeDocument':
        task = this.engine[name]!(...args);
        break;
      case 'closeAllDocuments':
        task = this.engine[name]!(...args);
        break;
      case 'saveAsCopy':
        task = this.engine[name]!(...args);
        break;
      case 'getAttachments':
        task = this.engine[name]!(...args);
        break;
      case 'addAttachment':
        task = this.engine[name]!(...args);
        break;
      case 'removeAttachment':
        task = this.engine[name]!(...args);
        break;
      case 'readAttachmentContent':
        task = this.engine[name]!(...args);
        break;
      case 'setFormFieldValue':
        task = this.engine[name]!(...args);
        break;
      case 'flattenPage':
        task = this.engine[name]!(...args);
        break;
      case 'extractPages':
        task = this.engine[name]!(...args);
        break;
      case 'extractText':
        task = this.engine[name]!(...args);
        break;
      case 'redactTextInRects':
        task = this.engine[name]!(...args);
        break;
      case 'getTextSlices':
        task = this.engine[name]!(...args);
        break;
      case 'getPageGlyphs':
        task = this.engine[name]!(...args);
        break;
      case 'getPageGeometry':
        task = this.engine[name]!(...args);
        break;
      case 'merge':
        task = this.engine[name]!(...args);
        break;
      case 'mergePages':
        task = this.engine[name]!(...args);
        break;
      case 'preparePrintDocument':
        task = this.engine[name]!(...args);
        break;
    }

    task.onProgress((progress) => {
      const response: ExecuteProgress = {
        id: request.id,
        type: 'ExecuteProgress',
        data: progress,
      };
      this.respond(response);
    });

    task.wait(
      (result) => {
        const response: ExecuteResponse = {
          id: request.id,
          type: 'ExecuteResponse',
          data: {
            type: 'result',
            value: result,
          },
        };
        this.respond(response);
      },
      (error) => {
        const response: ExecuteResponse = {
          id: request.id,
          type: 'ExecuteResponse',
          data: {
            type: 'error',
            value: error,
          },
        };
        this.respond(response);
      },
    );
  };

  /**
   * Send back the response
   * @param response - response that needs sent back
   *
   * @protected
   */
  respond(response: Response) {
    this.logger.debug(LOG_SOURCE, LOG_CATEGORY, 'runner respond: ', response);
    self.postMessage(response);
  }
}
