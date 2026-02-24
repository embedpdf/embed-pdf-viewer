import { readFile, writeFile } from 'fs/promises';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';

import { init } from '@embedpdf/pdfium';
import { PdfiumNative, PdfEngine } from '@embedpdf/engines/pdfium';
import { createNodeImageDataToBufferConverter } from '@embedpdf/engines/converters';
import { ConsoleLogger, PdfTrappedStatus } from '@embedpdf/models';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function runExample() {
  const logger = new ConsoleLogger();

  // Create the image converter using sharp
  const imageConverter = createNodeImageDataToBufferConverter(sharp);

  // Initialize PDFium WASM module
  const pdfiumModule = await init();

  // Create the native executor (low-level PDFium wrapper)
  const native = new PdfiumNative(pdfiumModule, { logger });

  // Create the orchestrator (high-level API with priority scheduling)
  // PdfiumNative initializes PDFium in its constructor, no separate init needed
  const engine = new PdfEngine(native, {
    imageConverter,
    logger,
  });

  const pdfPath = process.argv[2] || join(__dirname, 'ebook.pdf');
  const pdfBuffer = await readFile(pdfPath);
  const document = await engine
    .openDocumentBuffer({
      id: 'sample',
      content: pdfBuffer,
    })
    .toPromise();

  const metadata = await engine.getMetadata(document).toPromise();
  console.log(metadata);

  await engine
    .setMetadata(document, {
      title: 'New Title',
      author: 'New Author',
      producer: 'EmbedPDF',
      creator: 'EmbedPDF',
      modificationDate: new Date(),
      trapped: PdfTrappedStatus.True,
    })
    .toPromise();

  const metadata2 = await engine.getMetadata(document).toPromise();
  console.log(metadata2);

  await engine.closeDocument(document).toPromise();

  process.exit(0);
}

// Run the example if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runExample().catch(console.error);
}
