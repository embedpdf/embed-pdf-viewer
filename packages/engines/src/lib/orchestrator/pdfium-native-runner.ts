import { Logger, NoopLogger, Task, TaskError, PdfErrorCode } from '@embedpdf/models';
import { PdfiumNative } from '../pdfium/engine';
import { init } from '@embedpdf/pdfium';

const LOG_SOURCE = 'PdfiumNativeRunner';
const LOG_CATEGORY = 'Worker';

/**
 * Request message from main thread
 */
export interface WorkerRequest {
  id: string;
  type: 'execute' | 'init';
  method?: string;
  args?: any[];
  wasmUrl?: string;
}

/**
 * Response message to main thread
 */
export interface WorkerResponse {
  id: string;
  type: 'result' | 'error' | 'progress' | 'ready';
  data?: any;
  error?: TaskError<any>;
  progress?: any;
}

/**
 * PdfiumNativeRunner - Worker runner for PdfiumNative
 *
 * This handles:
 * - Initialization of PdfiumNative in worker context
 * - Message handling from main thread
 * - Task execution and result forwarding
 * - Progress tracking
 */
export class PdfiumNativeRunner {
  native: PdfiumNative | null = null;
  logger: Logger;
  private activeTasks = new Map<string, Task<any, any>>();

  constructor(logger?: Logger) {
    this.logger = logger ?? new NoopLogger();
    this.logger.debug(LOG_SOURCE, LOG_CATEGORY, 'PdfiumNativeRunner created');
  }

  /**
   * Initialize PDFium with WASM binary
   */
  async prepare(wasmBinary: ArrayBuffer, logger?: Logger): Promise<void> {
    this.logger.debug(LOG_SOURCE, LOG_CATEGORY, 'Preparing PDFium...');

    try {
      const module = await init({ wasmBinary });

      // PdfiumNative initializes PDFium in its constructor
      this.native = new PdfiumNative(module, { logger: logger ?? this.logger });

      this.logger.debug(LOG_SOURCE, LOG_CATEGORY, 'PDFium initialized successfully');
    } catch (error) {
      this.logger.error(LOG_SOURCE, LOG_CATEGORY, 'Failed to initialize PDFium:', error);
      throw error;
    }
  }

  /**
   * Start listening for messages
   */
  listen(): void {
    self.onmessage = (evt: MessageEvent<WorkerRequest>) => {
      this.handle(evt);
    };
    this.logger.debug(LOG_SOURCE, LOG_CATEGORY, 'Listening for messages');
  }

  /**
   * Handle incoming messages
   */
  handle(evt: MessageEvent<WorkerRequest>): void {
    const request = evt.data;
    this.logger.debug(LOG_SOURCE, LOG_CATEGORY, 'Received message:', request.type);

    try {
      switch (request.type) {
        case 'init':
          this.handleInit(request);
          break;
        case 'execute':
          this.handleExecute(request);
          break;
        default:
          this.logger.warn(LOG_SOURCE, LOG_CATEGORY, 'Unknown message type:', request.type);
      }
    } catch (error) {
      this.logger.error(LOG_SOURCE, LOG_CATEGORY, 'Error handling message:', error);
      this.respond({
        id: request.id,
        type: 'error',
        error: {
          type: 'reject',
          reason: { code: PdfErrorCode.Unknown, message: String(error) },
        },
      });
    }
  }

  /**
   * Handle initialization request
   */
  private async handleInit(request: WorkerRequest): Promise<void> {
    if (!request.wasmUrl) {
      this.respond({
        id: request.id,
        type: 'error',
        error: {
          type: 'reject',
          reason: { code: PdfErrorCode.Unknown, message: 'Missing wasmUrl' },
        },
      });
      return;
    }

    try {
      // Fetch WASM binary
      const response = await fetch(request.wasmUrl);
      const wasmBinary = await response.arrayBuffer();

      await this.prepare(wasmBinary);
      this.respond({
        id: request.id,
        type: 'ready',
      });
    } catch (error) {
      this.respond({
        id: request.id,
        type: 'error',
        error: {
          type: 'reject',
          reason: { code: PdfErrorCode.Unknown, message: String(error) },
        },
      });
    }
  }

  /**
   * Handle method execution request
   */
  private async handleExecute(request: WorkerRequest): Promise<void> {
    if (!this.native) {
      this.respond({
        id: request.id,
        type: 'error',
        error: {
          type: 'reject',
          reason: { code: PdfErrorCode.NotReady, message: 'PDFium not initialized' },
        },
      });
      return;
    }

    if (!request.method) {
      this.respond({
        id: request.id,
        type: 'error',
        error: {
          type: 'reject',
          reason: { code: PdfErrorCode.Unknown, message: 'Missing method name' },
        },
      });
      return;
    }

    const method = request.method;
    const args = request.args ?? [];

    // Check if method exists
    if (!(method in this.native) || typeof (this.native as any)[method] !== 'function') {
      this.respond({
        id: request.id,
        type: 'error',
        error: {
          type: 'reject',
          reason: { code: PdfErrorCode.NotSupport, message: `Method ${method} not supported` },
        },
      });
      return;
    }

    try {
      this.logger.debug(LOG_SOURCE, LOG_CATEGORY, `Executing method: ${method}`);

      // Execute the method
      const result = (this.native as any)[method](...args);

      // If result is a Task, handle it specially
      if (result && typeof result === 'object' && 'wait' in result) {
        const task = result as Task<any, any>;
        this.activeTasks.set(request.id, task);

        // Listen for progress
        task.onProgress((progress) => {
          this.respond({
            id: request.id,
            type: 'progress',
            progress,
          });
        });

        // Wait for result
        task.wait(
          (data) => {
            this.logger.debug(LOG_SOURCE, LOG_CATEGORY, `Method ${method} resolved`);
            this.respond({
              id: request.id,
              type: 'result',
              data,
            });
            this.activeTasks.delete(request.id);
          },
          (error) => {
            this.logger.debug(LOG_SOURCE, LOG_CATEGORY, `Method ${method} failed:`, error);
            this.respond({
              id: request.id,
              type: 'error',
              error,
            });
            this.activeTasks.delete(request.id);
          },
        );
      } else {
        // Synchronous result
        this.respond({
          id: request.id,
          type: 'result',
          data: result,
        });
      }
    } catch (error) {
      this.logger.error(LOG_SOURCE, LOG_CATEGORY, `Error executing ${method}:`, error);
      this.respond({
        id: request.id,
        type: 'error',
        error: {
          type: 'reject',
          reason: { code: PdfErrorCode.Unknown, message: String(error) },
        },
      });
    }
  }

  /**
   * Send response back to main thread
   */
  private respond(response: WorkerResponse): void {
    this.logger.debug(LOG_SOURCE, LOG_CATEGORY, 'Sending response:', response.type);
    self.postMessage(response);
  }

  /**
   * Ready notification
   */
  ready(): void {
    this.listen();
    this.respond({
      id: '0',
      type: 'ready',
    });
    this.logger.debug(LOG_SOURCE, LOG_CATEGORY, 'Runner is ready');
  }
}
