import { init } from '@embedpdf/pdfium';
import { PdfiumNativeRunner } from '../orchestrator/pdfium-native-runner';
import { PdfiumNative } from './engine';
import { Logger } from '@embedpdf/models';

/**
 * EngineRunner for pdfium-based wasm engine
 */
export class PdfiumEngineRunner extends PdfiumNativeRunner {
  /**
   * Create an instance of PdfiumEngineRunner
   * @param wasmBinary - wasm binary that contains the pdfium wasm file
   */
  constructor(
    private wasmBinary: ArrayBuffer,
    logger?: Logger,
  ) {
    super(logger);
  }

  /**
   * Initialize runner
   */
  async prepare() {
    const wasmBinary = this.wasmBinary;
    const wasmModule = await init({ wasmBinary });

    // Create the "dumb" executor
    this.native = new PdfiumNative(wasmModule, { logger: this.logger });
    this.native.initialize();

    this.ready();
  }
}
