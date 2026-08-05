import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPdfRuntime } from '@embedpdf/engine-runtime';
import { runDemo } from './demo.ts';

const here = dirname(fileURLToPath(import.meta.url));
const pdfPath = process.argv[2] ?? resolve(here, '..', 'public', 'sample.pdf');
const bytes = new Uint8Array(await readFile(pdfPath));

const prefer = process.env.PDF_RUNTIME_PREFER === 'wasm' ? 'wasm' : 'auto';
const runtime = await createPdfRuntime({ prefer });

try {
  const result = await runDemo(runtime, bytes);
  console.log(JSON.stringify(result, null, 2));
} finally {
  await runtime.destroy();
}
