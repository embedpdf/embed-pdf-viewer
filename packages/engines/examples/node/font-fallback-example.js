/**
 * Font Fallback Example - Japanese PDF
 *
 * This example demonstrates how to use the font fallback system
 * to render PDFs with non-embedded Japanese fonts.
 *
 * Usage:
 *   node font-fallback-example.js [pdf-path]
 *
 * Default: renders japan.pdf from the same directory
 */

import { readFile, writeFile } from 'fs/promises';
import * as fs from 'fs';
import { dirname, join } from 'path';
import * as path from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';

import { init } from '@embedpdf/pdfium';
import { PdfiumNative, PdfEngine, createNodeFontLoader } from '@embedpdf/engines/pdfium';
import { createNodeImageDataToBufferConverter } from '@embedpdf/engines/converters';
import { ConsoleLogger, FontCharset, Rotation } from '@embedpdf/models';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Path to Japanese fonts
const JP_FONTS_DIR = join(__dirname, '../../../../packages/fonts/jp/fonts');

async function runExample() {
  console.log('=== Japanese Font Fallback Example ===\n');
  console.log(`Japanese fonts directory: ${JP_FONTS_DIR}\n`);

  // Verify fonts exist
  try {
    const files = fs.readdirSync(JP_FONTS_DIR);
    console.log('Available fonts:');
    files.forEach((f) => console.log(`  - ${f}`));
    console.log('');
  } catch (error) {
    console.error(`ERROR: Cannot read fonts directory: ${JP_FONTS_DIR}`);
    console.error(error.message);
    process.exit(1);
  }

  const logger = new ConsoleLogger();

  // Create the image converter using sharp
  const imageConverter = createNodeImageDataToBufferConverter(sharp);

  // Initialize PDFium WASM module
  console.log('Initializing PDFium...');
  const pdfiumModule = await init();

  // Configure font fallback for Japanese documents only
  const fontFallback = {
    fonts: {
      [FontCharset.SHIFTJIS]: 'NotoSansJP-Regular.otf',
    },
    fontLoader: createNodeFontLoader(fs, path, JP_FONTS_DIR),
  };

  console.log(`Font fallback configured for SHIFTJIS (Japanese)\n`);

  // Create the native executor with font fallback
  const native = new PdfiumNative(pdfiumModule, {
    logger,
    fontFallback,
  });

  // Create the orchestrator
  const engine = new PdfEngine(native, {
    imageConverter,
    logger,
  });

  // Load the Japanese PDF
  const pdfPath = process.argv[2] || join(__dirname, 'japan.pdf');
  console.log(`Loading PDF: ${pdfPath}`);

  const pdfBuffer = await readFile(pdfPath);
  const document = await engine
    .openDocumentBuffer({
      id: 'japan-test',
      content: pdfBuffer,
    })
    .toPromise();

  console.log(`PDF loaded: ${document.pageCount} page(s)\n`);

  // Render each page
  for (let i = 0; i < document.pageCount; i++) {
    const page = document.pages[i];
    console.log(`Rendering page ${i + 1}...`);

    const pdfImage = await engine
      .renderPage(document, page, {
        rotation: Rotation.Degree0,
        imageType: 'image/png',
        scale: 2,
      })
      .toPromise();

    const outputPath = join(__dirname, `output-page-${i + 1}.png`);
    await writeFile(outputPath, pdfImage);
    console.log(`  Saved: ${outputPath}`);
  }

  await engine.closeDocument(document).toPromise();

  console.log('\n=== Done! ===');
  console.log('Check the output PNG files to verify Japanese text is rendered correctly.');

  process.exit(0);
}

// Run the example
runExample().catch((error) => {
  console.error('Error:', error);
  process.exit(1);
});
