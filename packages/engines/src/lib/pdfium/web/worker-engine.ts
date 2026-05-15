import { Logger } from '@embedpdf/models';
import { PdfEngine } from '../../orchestrator/pdf-engine';
import { RemoteExecutor } from '../../orchestrator/remote-executor';
import { ImageEncoderWorkerPool } from '../../image-encoder';
import { createHybridImageConverter } from '../../converters/browser';
import type { FontFallbackConfig } from '../font-fallback';

export type { FontFallbackConfig };

/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-ignore injected at build time
declare const __WEBWORKER_BODY__: string;
// @ts-ignore injected at build time
declare const __ENCODER_WORKER_BODY__: string;

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
   * Font fallback configuration for handling missing fonts in PDFs.
   * When enabled, PDFium will request fallback fonts from configured URLs
   * when it encounters text that requires fonts not embedded in the PDF.
   */
  fontFallback?: FontFallbackConfig;
  /**
   * URL to the PDFium worker script.
   * When provided, the worker is loaded from this URL instead of a blob: URL,
   * allowing strict CSP without `worker-src blob:`.
   *
   * @example
   * // Vite
   * workerUrl: new URL('@embedpdf/engines/pdfium-worker', import.meta.url).href
   * // Or a static asset
   * workerUrl: '/assets/embedpdf-worker.js'
   */
  workerUrl?: string;
  /**
   * URL to the image encoder worker script.
   * When provided, the encoder pool workers are loaded from this URL instead
   * of a blob: URL, allowing strict CSP without `worker-src blob:`.
   *
   * @example
   * encoderWorkerUrl: '/assets/embedpdf-encoder-worker.js'
   */
  encoderWorkerUrl?: string;
}

/**
 * Create a PDFium engine running in a Web Worker
 *
 * This is the "worker" mode where PDFium runs in a separate worker thread.
 * The PdfEngine orchestrator provides priority-based task scheduling and
 * parallel image encoding with a separate encoder pool.
 *
 * @param wasmUrl - URL to the pdfium.wasm file
 * @param options - Configuration options (can be Logger for backward compatibility)
 *
 * @example
 * // Legacy usage (backward compatible)
 * const engine = createPdfiumEngine('/wasm/pdfium.wasm', logger);
 *
 * @example
 * // With encoder pool (automatic - no URL needed!)
 * const engine = createPdfiumEngine('/wasm/pdfium.wasm', {
 *   logger,
 *   encoderPoolSize: 2
 * });
 *
 * @example
 * // With custom encoder worker URL
 * const engine = createPdfiumEngine('/wasm/pdfium.wasm', {
 *   logger,
 *   encoderPoolSize: 2,
 *   encoderWorkerUrl: '/custom/encoder-worker.js'
 * });
 */
export function createPdfiumEngine(
  wasmUrl: string,
  options?: Logger | CreatePdfiumEngineOptions,
): PdfEngine<Blob> {
  // Handle backward compatibility - accept Logger directly
  const config: CreatePdfiumEngineOptions =
    options instanceof Object && 'debug' in options
      ? { logger: options as Logger }
      : (options as CreatePdfiumEngineOptions) || {};

  const { logger, encoderPoolSize, fontFallback, workerUrl, encoderWorkerUrl } = config;

  // Create PDFium worker — use a static URL when provided to avoid blob: in CSP
  const resolvedWorkerUrl =
    workerUrl ??
    URL.createObjectURL(new Blob([__WEBWORKER_BODY__], { type: 'application/javascript' }));
  const worker = new Worker(resolvedWorkerUrl, { type: 'module' });

  // Create RemoteExecutor (proxy to worker) - handles wasmInit internally
  const remoteExecutor = new RemoteExecutor(worker, { wasmUrl, logger, fontFallback });

  const finalEncoderWorkerUrl =
    encoderWorkerUrl ??
    URL.createObjectURL(new Blob([__ENCODER_WORKER_BODY__], { type: 'application/javascript' }));
  const encoderPool = new ImageEncoderWorkerPool(
    encoderPoolSize ?? 2,
    finalEncoderWorkerUrl,
    logger,
  );

  // Create the "smart" orchestrator
  return new PdfEngine<Blob>(remoteExecutor, {
    imageConverter: createHybridImageConverter(encoderPool),
    logger,
  });
}
