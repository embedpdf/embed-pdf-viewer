import { Logger } from '@embedpdf/models';
import { init } from '@embedpdf/pdfium';
import { PdfiumNative } from '../engine';
import { PdfEngine } from '../../orchestrator/pdf-engine';
import { browserImageDataToBlobConverter } from '../../converters/browser';
import type { FontFallbackConfig } from '../font-fallback';

export type { FontFallbackConfig };

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
 *   encoderPoolSize: 2
 * });
 */
export async function createPdfiumEngine(
  wasmUrl: string,
  options?: CreatePdfiumEngineOptions,
): Promise<PdfEngine<Blob>> {
  const response = await fetch(wasmUrl);
  const wasmBinary = await response.arrayBuffer();
  const wasmModule = await init({ wasmBinary });

  // Create the "dumb" executor (initializes PDFium in constructor)
  const native = new PdfiumNative(wasmModule, {
    logger: options?.logger,
    fontFallback: options?.fontFallback,
  });

  // Create the "smart" orchestrator
  return new PdfEngine<Blob>(native, {
    imageConverter: browserImageDataToBlobConverter,
    logger: options?.logger,
  });
}
