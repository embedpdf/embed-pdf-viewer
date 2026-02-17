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
        task = engine.isSupport!(...args);
        break;
      case 'destroy':
        task = engine.destroy!(...args);
        break;
      case 'openDocumentUrl':
        task = engine.openDocumentUrl!(...args);
        break;
      case 'openDocumentBuffer':
        task = engine.openDocumentBuffer!(...args);
        break;
      case 'getDocPermissions':
        task = engine.getDocPermissions!(...args);
        break;
      case 'getDocUserPermissions':
        task = engine.getDocUserPermissions!(...args);
        break;
      case 'getMetadata':
        task = engine.getMetadata!(...args);
        break;
      case 'setMetadata':
        task = engine.setMetadata!(...args);
        break;
      case 'getBookmarks':
        task = engine.getBookmarks!(...args);
        break;
      case 'setBookmarks':
        task = engine.setBookmarks!(...args);
        break;
      case 'deleteBookmarks':
        task = engine.deleteBookmarks!(...args);
        break;
      case 'getSignatures':
        task = engine.getSignatures!(...args);
        break;
      case 'renderPage':
        task = engine.renderPage!(...args);
        break;
      case 'renderPageRect':
        task = engine.renderPageRect!(...args);
        break;
      case 'renderPageAnnotation':
        task = engine.renderPageAnnotation!(...args);
        break;
      case 'renderPageAnnotationsRaw':
        task = engine.renderPageAnnotationsRaw!(...args);
        break;
      case 'renderThumbnail':
        task = engine.renderThumbnail!(...args);
        break;
      case 'getAllAnnotations':
        task = engine.getAllAnnotations!(...args);
        break;
      case 'getPageAnnotations':
        task = engine.getPageAnnotations!(...args);
        break;
      case 'createPageAnnotation':
        task = engine.createPageAnnotation!(...args);
        break;
      case 'updatePageAnnotation':
        task = engine.updatePageAnnotation!(...args);
        break;
      case 'removePageAnnotation':
        task = engine.removePageAnnotation!(...args);
        break;
      case 'getPageTextRects':
        task = engine.getPageTextRects!(...args);
        break;
      case 'searchAllPages':
        task = engine.searchAllPages!(...args);
        break;
      case 'closeDocument':
        task = engine.closeDocument!(...args);
        break;
      case 'closeAllDocuments':
        task = engine.closeAllDocuments!(...args);
        break;
      case 'saveAsCopy':
        task = engine.saveAsCopy!(...args);
        break;
      case 'getAttachments':
        task = engine.getAttachments!(...args);
        break;
      case 'addAttachment':
        task = engine.addAttachment!(...args);
        break;
      case 'removeAttachment':
        task = engine.removeAttachment!(...args);
        break;
      case 'readAttachmentContent':
        task = engine.readAttachmentContent!(...args);
        break;
      case 'setFormFieldValue':
        task = engine.setFormFieldValue!(...args);
        break;
      case 'flattenPage':
        task = engine.flattenPage!(...args);
        break;
      case 'extractPages':
        task = engine.extractPages!(...args);
        break;
      case 'extractText':
        task = engine.extractText!(...args);
        break;
      case 'redactTextInRects':
        task = engine.redactTextInRects!(...args);
        break;
      case 'applyRedaction':
        task = engine.applyRedaction!(...args);
        break;
      case 'applyAllRedactions':
        task = engine.applyAllRedactions!(...args);
        break;
      case 'flattenAnnotation':
        task = engine.flattenAnnotation!(...args);
        break;
      case 'getTextSlices':
        task = engine.getTextSlices!(...args);
        break;
      case 'getPageGlyphs':
        task = engine.getPageGlyphs!(...args);
        break;
      case 'getPageGeometry':
        task = engine.getPageGeometry!(...args);
        break;
      case 'merge':
        task = engine.merge!(...args);
        break;
      case 'mergePages':
        task = engine.mergePages!(...args);
        break;
      case 'preparePrintDocument':
        task = engine.preparePrintDocument!(...args);
        break;
      case 'setDocumentEncryption':
        task = engine.setDocumentEncryption(...args);
        break;
      case 'removeEncryption':
        task = engine.removeEncryption(...args);
        break;
      case 'unlockOwnerPermissions':
        task = engine.unlockOwnerPermissions(...args);
        break;
      case 'isEncrypted':
        task = engine.isEncrypted(...args);
        break;
      case 'isOwnerUnlocked':
        task = engine.isOwnerUnlocked(...args);
        break;
      default:
        // This should never be reached due to the earlier check, but provides exhaustiveness
        const error: PdfEngineError = {
          type: 'reject',
          reason: {
            code: PdfErrorCode.NotSupport,
            message: `engine method ${name} is not supported`,
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
