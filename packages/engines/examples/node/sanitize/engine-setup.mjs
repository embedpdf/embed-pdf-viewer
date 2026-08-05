// Shared headless engine setup for the sanitize tests (sharp-free, quiet logger).
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { init } from '@embedpdf/pdfium';
import { PdfiumNative, PdfEngine } from '@embedpdf/engines/pdfium';
import { NoopLogger } from '@embedpdf/models';

export async function makeEngine() {
  const logger = new NoopLogger();
  const pdfiumModule = await init();
  const native = new PdfiumNative(pdfiumModule, { logger });
  // No imageConverter: sanitize/metadata/save ops never render.
  return new PdfEngine(native, { logger });
}

export async function openDirty(engine, id = 'dirty') {
  const content = await readFile(fileURLToPath(new URL('./dirty.pdf', import.meta.url)));
  return engine.openDocumentBuffer({ id, content }).toPromise();
}
