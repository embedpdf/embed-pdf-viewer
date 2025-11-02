import { init } from '@embedpdf/pdfium';
import { Logger } from '@embedpdf/models';
import { EngineRunner } from '../webworker/runner';
import { PdfiumNative } from './engine';
import { PdfEngine } from '../orchestrator/pdf-engine';
import { ImageEncoderWorkerPool } from '../image-encoder';
import { browserImageDataToBlobConverter } from './image-converter';

/**
 * Configuration options for PdfiumEngineRunner with image encoder pool
 */
export interface PdfiumEngineRunnerOptions {
  logger?: Logger;
  /**
   * Number of workers in the image encoder pool (default: 2)
   * Set to 0 to disable worker pool and use legacy inline encoding
   */
  encoderPoolSize?: number;
  /**
   * URL to the image encoder worker script
   */
  encoderWorkerUrl?: string;
}

/**
 * Enhanced EngineRunner for pdfium that uses a dedicated worker pool
 * for image encoding operations
 * @deprecated Use PdfiumNativeRunner from orchestrator instead
 */
export class PdfiumEngineRunnerWithEncoderPool extends EngineRunner {
  private encoderPool?: ImageEncoderWorkerPool;

  /**
   * Create an instance of PdfiumEngineRunnerWithEncoderPool
   * @param wasmBinary - wasm binary that contains the pdfium wasm file
   * @param options - configuration options
   */
  constructor(
    private wasmBinary: ArrayBuffer,
    private options: PdfiumEngineRunnerOptions = {},
  ) {
    super(options.logger);
  }

  /**
   * Initialize runner with optional encoder pool
   */
  async prepare() {
    const wasmBinary = this.wasmBinary;
    const wasmModule = await init({ wasmBinary });

    const { encoderPoolSize = 2, encoderWorkerUrl } = this.options;

    // Create the "dumb" executor
    const native = new PdfiumNative(wasmModule, { logger: this.logger });
    native.initialize();

    // Create encoder pool if enabled and URL provided
    if (encoderPoolSize > 0 && encoderWorkerUrl) {
      try {
        this.encoderPool = new ImageEncoderWorkerPool(
          encoderPoolSize,
          encoderWorkerUrl,
          this.logger,
        );

        // Create the "smart" orchestrator with encoder pool
        this.engine = new PdfEngine(native as any, {
          imageConverter: browserImageDataToBlobConverter,
          fetcher: typeof fetch !== 'undefined' ? fetch : undefined,
          logger: this.logger,
          encoderPool: this.encoderPool,
        }) as any;

        this.logger.info(
          'PdfiumEngineRunner',
          'Engine',
          `Initialized with encoder pool (${encoderPoolSize} workers)`,
        );
      } catch (error) {
        this.logger.error(
          'PdfiumEngineRunner',
          'Engine',
          'Failed to create encoder pool, falling back to legacy encoding:',
          error,
        );

        // Fallback to legacy encoding
        this.engine = new PdfEngine(native as any, {
          imageConverter: browserImageDataToBlobConverter,
          fetcher: typeof fetch !== 'undefined' ? fetch : undefined,
          logger: this.logger,
        }) as any;
      }
    } else {
      // Use legacy inline encoding
      this.engine = new PdfEngine(native as any, {
        imageConverter: browserImageDataToBlobConverter,
        fetcher: typeof fetch !== 'undefined' ? fetch : undefined,
        logger: this.logger,
      }) as any;
      this.logger.info('PdfiumEngineRunner', 'Engine', 'Initialized with legacy inline encoding');
    }

    this.ready();
  }

  /**
   * Clean up encoder pool on destroy
   */
  destroy() {
    if (this.encoderPool) {
      this.encoderPool.destroy();
      this.encoderPool = undefined;
    }
  }
}
