// The wasm heap may grow to 4 GiB, and an address at or above 2 GiB reaches JS
// as a negative i32. With the low 2 GiB of the heap taken, every later
// allocation lands above it: documents opened, rendered and read there must give
// what they give low in the heap.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';

const TWO_GIB = 2n ** 31n;
const FIXTURES = ['hello_world.pdf', 'embedded_images.pdf'].map((name) =>
  resolve('runtime-src/testing/resources', name),
);

async function readDocuments(runtime, { highHeap }) {
  const rt = await runtime.createPdfRuntime({ prefer: 'wasm' });
  const { fn, mem, fileAccess } = rt;
  fn.FPDF_InitLibrary();
  if (highHeap) {
    // Never freed: the rest of the run allocates above it.
    mem.alloc(2 ** 31 + 64 * 2 ** 20);
  }
  const probe = mem.alloc(16);
  assert.equal(probe >= TWO_GIB, highHeap, `probe allocation at ${probe}`);

  // A pointer written to memory and read back.
  mem.poke(probe, 'ptr', probe);
  assert.equal(mem.peek(probe, 'ptr'), probe);
  mem.free(probe);

  const results = [];
  for (const file of FIXTURES) {
    const access = fileAccess.fromMemory(readFileSync(file));
    const doc = fn.FPDF_LoadCustomDocument(access.ptr, '');
    assert.ok(doc, `open ${file}`);
    const page = fn.FPDF_LoadPage(doc, 0);
    const width = Math.round(fn.FPDF_GetPageWidthF(page) * 1.5);
    const height = Math.round(fn.FPDF_GetPageHeightF(page) * 1.5);
    const bitmap = fn.FPDFBitmap_Create(width, height, 1);
    fn.FPDFBitmap_FillRect(bitmap, 0, 0, width, height, 0xffffffff);
    fn.FPDF_RenderPageBitmap(bitmap, page, 0, 0, width, height, 0, 0x01);
    const buffer = fn.FPDFBitmap_GetBuffer(bitmap);
    if (highHeap) assert.ok(buffer >= TWO_GIB, `bitmap at ${buffer}`);
    const pixels = mem.readBytes(buffer, fn.FPDFBitmap_GetStride(bitmap) * height);

    const textPage = fn.FPDFText_LoadPage(page);
    const chars = fn.FPDFText_CountChars(textPage);
    const textPtr = mem.alloc((chars + 1) * 2);
    fn.FPDFText_GetText(textPage, 0, chars, textPtr);
    const text = mem.readU16String(textPtr);
    mem.free(textPtr);
    fn.FPDFText_ClosePage(textPage);

    results.push({ file, sha: createHash('sha256').update(pixels).digest('hex'), text });
    fn.FPDFBitmap_Destroy(bitmap);
    fn.FPDF_ClosePage(page);
    fn.FPDF_CloseDocument(doc);
    access.close();
  }
  await rt.destroy();
  return results;
}

test('wasm runtime reads, renders and writes above 2 GiB as it does below', async (t) => {
  const runtime = await import('../dist/index.node.js').catch(() => null);
  if (!runtime || FIXTURES.some((file) => !existsSync(file))) {
    t.skip('the runtime dist or the PDFium fixtures are not built');
    return;
  }
  const low = await readDocuments(runtime, { highHeap: false });
  const high = await readDocuments(runtime, { highHeap: true });
  assert.ok(low.some((result) => result.text.length > 0));
  assert.deepEqual(high, low);
});
