import { deserializeLogger } from '@embedpdf/models';
import { PdfiumEngineRunner } from './runner';
import type { FontFallbackConfig } from './font-fallback';
import { cdnFontConfig } from './cdn-fonts';

let runner: PdfiumEngineRunner | null = null;

// Listen for initialization message
self.onmessage = async (event: MessageEvent) => {
  const { type, wasmUrl, logger: serializedLogger, fontFallback } = event.data;

  if (type === 'wasmInit' && wasmUrl && !runner) {
    try {
      const response = await fetch(wasmUrl);
      const wasmBinary = await response.arrayBuffer();

      // Deserialize the logger if provided
      const logger = serializedLogger ? deserializeLogger(serializedLogger) : undefined;

      // Use CDN font fallback by default in worker (browser environment)
      // User can override with custom config or set to null/undefined to disable
      const effectiveFontFallback =
        fontFallback === null
          ? undefined // Explicitly disabled
          : ((fontFallback as FontFallbackConfig | undefined) ?? cdnFontConfig); // Use CDN by default

      runner = new PdfiumEngineRunner(wasmBinary, logger, effectiveFontFallback);
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
