import { deserializeLogger } from '@embedpdf/models';
import { PdfiumEngineRunner } from './runner';
import { PdfiumNativeRunner } from '../orchestrator';

let runner: PdfiumNativeRunner | null = null;

console.log('worker');

// Listen for initialization message
self.onmessage = async (event) => {
  const { type, wasmUrl, logger: serializedLogger } = event.data;

  console.log('wasmInit', type, wasmUrl, serializedLogger);

  if (type === 'wasmInit' && wasmUrl && !runner) {
    try {
      const response = await fetch(wasmUrl);
      const wasmBinary = await response.arrayBuffer();

      // Deserialize the logger if provided
      const logger = serializedLogger ? deserializeLogger(serializedLogger) : undefined;

      const nativeRunner = new PdfiumEngineRunner(wasmBinary, logger);

      await nativeRunner.prepare();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      self.postMessage({ type: 'wasmError', error: message });
    }
  }
};
