import { deserializeLogger } from '@embedpdf/models';
import { PdfiumEngineRunner } from './runner';

let runner: PdfiumEngineRunner | null = null;

// Listen for initialization message
self.onmessage = async (event: MessageEvent) => {
  const { type, wasmUrl, logger: serializedLogger } = event.data;

  if (type === 'wasmInit' && wasmUrl && !runner) {
    try {
      const response = await fetch(wasmUrl);
      const wasmBinary = await response.arrayBuffer();

      // Deserialize the logger if provided
      const logger = serializedLogger ? deserializeLogger(serializedLogger) : undefined;

      runner = new PdfiumEngineRunner(wasmBinary, logger);
      await runner.prepare();
      // runner.prepare() calls ready() which:
      // 1. Sets self.onmessage to runner.handle()
      // 2. Sends 'ready' message to main thread
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      self.postMessage({ type: 'wasmError', error: message });
    }
  }
};
