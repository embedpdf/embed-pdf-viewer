import { init } from '@embedpdf/pdfium';
import { PdfiumNativeRunner } from '../orchestrator/pdfium-native-runner';
import { PdfiumNative } from './engine';
import { Logger } from '@embedpdf/models';
import type { FontFallbackConfig } from './font-fallback';

/**
 * EngineRunner for pdfium-based wasm engine
 */
export class PdfiumEngineRunner extends PdfiumNativeRunner {
  private fontFallback?: FontFallbackConfig;

  /**
   * Create an instance of PdfiumEngineRunner
   * @param wasmBinary - wasm binary that contains the pdfium wasm file
   * @param logger - optional logger instance
   * @param fontFallback - optional font fallback configuration
   */
  constructor(
    private wasmBinary: ArrayBuffer,
    logger?: Logger,
    fontFallback?: FontFallbackConfig,
  ) {
    super(logger);
    this.fontFallback = fontFallback;
  }

  /**
   * Initialize runner
   */
  async prepare() {
    const wasmBinary = this.wasmBinary;
    const wasmModule = await init({ wasmBinary });

    // Create the "dumb" executor (initializes PDFium in constructor)
    this.native = new PdfiumNative(wasmModule, {
      logger: this.logger,
      fontFallback: this.fontFallback,
    });

    this.ready();
  }
}
