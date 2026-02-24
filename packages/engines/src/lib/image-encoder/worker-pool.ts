import { Logger, NoopLogger } from '@embedpdf/models';
import type { EncodeImageRequest, EncodeImageResponse } from './image-encoder-worker';

const LOG_SOURCE = 'ImageEncoderPool';
const LOG_CATEGORY = 'Encoder';

interface EncodingTask {
  resolve: (blob: Blob) => void;
  reject: (error: Error) => void;
}

/**
 * Pool of image encoding workers to offload OffscreenCanvas operations
 * from the main PDFium worker thread
 */
export class ImageEncoderWorkerPool {
  private workers: Worker[] = [];
  private pendingTasks = new Map<string, EncodingTask>();
  private nextWorkerId = 0;
  private requestCounter = 0;
  private logger: Logger;

  /**
   * Create a pool of image encoding workers
   * @param poolSize - Number of workers to create (default: 2)
   * @param workerUrl - URL to the worker script
   * @param logger - Logger instance
   */
  constructor(
    private poolSize: number = 2,
    private workerUrl: string,
    logger?: Logger,
  ) {
    this.logger = logger ?? new NoopLogger();
    this.initialize();
  }

  /**
   * Initialize the worker pool
   */
  private initialize() {
    this.logger.debug(
      LOG_SOURCE,
      LOG_CATEGORY,
      `Creating worker pool with ${this.poolSize} workers`,
    );

    for (let i = 0; i < this.poolSize; i++) {
      try {
        const worker = new Worker(this.workerUrl, { type: 'module' });
        worker.onmessage = this.handleWorkerMessage.bind(this);
        worker.onerror = this.handleWorkerError.bind(this);
        this.workers.push(worker);

        this.logger.debug(LOG_SOURCE, LOG_CATEGORY, `Worker ${i} created successfully`);
      } catch (error) {
        this.logger.error(LOG_SOURCE, LOG_CATEGORY, `Failed to create worker ${i}:`, error);
      }
    }
  }

  /**
   * Handle messages from workers
   */
  private handleWorkerMessage(event: MessageEvent<EncodeImageResponse>) {
    const response = event.data;
    const task = this.pendingTasks.get(response.id);

    if (!task) {
      this.logger.warn(
        LOG_SOURCE,
        LOG_CATEGORY,
        `Received response for unknown task: ${response.id}`,
      );
      return;
    }

    this.pendingTasks.delete(response.id);

    if (response.type === 'result') {
      task.resolve(response.data as Blob);
    } else {
      const errorData = response.data as { message: string };
      task.reject(new Error(errorData.message));
    }
  }

  /**
   * Handle worker errors
   */
  private handleWorkerError(error: ErrorEvent) {
    this.logger.error(LOG_SOURCE, LOG_CATEGORY, 'Worker error:', error.message);
  }

  /**
   * Get the next available worker using round-robin
   */
  private getNextWorker(): Worker | null {
    if (this.workers.length === 0) {
      return null;
    }

    const worker = this.workers[this.nextWorkerId];
    this.nextWorkerId = (this.nextWorkerId + 1) % this.workers.length;
    return worker;
  }

  /**
   * Encode ImageData to Blob using a worker from the pool
   * @param imageData - Raw image data
   * @param imageType - Target image format
   * @param quality - Image quality (0-1) for lossy formats
   * @returns Promise that resolves to encoded Blob
   */
  encode(
    imageData: { data: Uint8ClampedArray; width: number; height: number },
    imageType: 'image/png' | 'image/jpeg' | 'image/webp' = 'image/webp',
    quality?: number,
  ): Promise<Blob> {
    return new Promise((resolve, reject) => {
      const worker = this.getNextWorker();

      if (!worker) {
        reject(new Error('No workers available in the pool'));
        return;
      }

      const requestId = `encode-${Date.now()}-${this.requestCounter++}`;
      this.pendingTasks.set(requestId, { resolve, reject });

      const request: EncodeImageRequest = {
        id: requestId,
        type: 'encode',
        data: {
          imageData: {
            data: imageData.data,
            width: imageData.width,
            height: imageData.height,
          },
          imageType,
          quality,
        },
      };

      this.logger.debug(
        LOG_SOURCE,
        LOG_CATEGORY,
        `Sending encoding request ${requestId} (${imageData.width}x${imageData.height})`,
      );

      // Transfer the buffer for better performance
      worker.postMessage(request, [imageData.data.buffer]);
    });
  }

  /**
   * Destroy all workers in the pool
   */
  destroy() {
    this.logger.debug(LOG_SOURCE, LOG_CATEGORY, 'Destroying worker pool');

    // Reject all pending tasks
    this.pendingTasks.forEach((task, id) => {
      task.reject(new Error('Worker pool destroyed'));
      this.logger.debug(LOG_SOURCE, LOG_CATEGORY, `Rejected pending task: ${id}`);
    });
    this.pendingTasks.clear();

    // Terminate all workers
    this.workers.forEach((worker, index) => {
      worker.terminate();
      this.logger.debug(LOG_SOURCE, LOG_CATEGORY, `Worker ${index} terminated`);
    });
    this.workers = [];
  }

  /**
   * Get the number of active workers in the pool
   */
  get activeWorkers(): number {
    return this.workers.length;
  }

  /**
   * Get the number of pending encoding tasks
   */
  get pendingTasksCount(): number {
    return this.pendingTasks.size;
  }
}
