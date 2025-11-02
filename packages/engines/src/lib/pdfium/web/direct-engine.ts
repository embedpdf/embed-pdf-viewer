import { Logger } from '@embedpdf/models';
import { init } from '@embedpdf/pdfium';
import { PdfiumNative } from '../engine';
import { PdfEngine } from '../../orchestrator/pdf-engine';
import { ImageEncoderWorkerPool } from '../../image-encoder';
import { browserImageDataToBlobConverter } from '../image-converter';

export interface CreatePdfiumEngineOptions {
  /**
   * Logger instance for debugging
   */
  logger?: Logger;
  /**
   * Number of workers in the image encoder pool (default: 0 - disabled)
   * Set to 2-4 for optimal performance with parallel encoding
   */
  encoderPoolSize?: number;
  /**
   * URL to the image encoder worker script (optional - uses built-in worker if not provided)
   * If not provided, the encoder worker code is automatically injected at build time
   */
  encoderWorkerUrl?: string;
}

/**
 * Create a PDFium engine running directly in the main thread
 *
 * This is the "direct" mode where PDFium runs in the main thread.
 * The PdfEngine orchestrator still provides priority-based task scheduling.
 *
 * @param wasmUrl - URL to the pdfium.wasm file
 * @param options - Configuration options
 *
 * @example
 * // Basic usage
 * const engine = await createPdfiumEngine('/wasm/pdfium.wasm', { logger });
 *
 * @example
 * // With encoder pool for parallel image encoding
 * const engine = await createPdfiumEngine('/wasm/pdfium.wasm', {
 *   logger,
 *   encoderPoolSize: 2,
 *   encoderWorkerUrl: '/workers/encoder.js'
 * });
 */
export async function createPdfiumEngine(
  wasmUrl: string,
  options?: CreatePdfiumEngineOptions,
): Promise<PdfEngine<Blob>> {
  const response = await fetch(wasmUrl);
  const wasmBinary = await response.arrayBuffer();
  const wasmModule = await init({ wasmBinary });

  // Create the "dumb" executor
  const native = new PdfiumNative(wasmModule, { logger: options?.logger });
  native.initialize();

  // Create encoder pool if requested
  let encoderPool: ImageEncoderWorkerPool | undefined;
  if (options?.encoderPoolSize && options.encoderPoolSize > 0) {
    if (!options.encoderWorkerUrl) {
      throw new Error('encoderWorkerUrl is required when encoderPoolSize > 0');
    }
    encoderPool = new ImageEncoderWorkerPool(
      options.encoderPoolSize,
      options.encoderWorkerUrl,
      options.logger,
    );
  }

  // Create the "smart" orchestrator
  // Cast native to IPdfExecutor since ImageData is compatible with ImageDataLike
  return new PdfEngine<Blob>(native as any, {
    imageConverter: browserImageDataToBlobConverter,
    fetcher: fetch,
    logger: options?.logger,
    encoderPool,
  });
}
