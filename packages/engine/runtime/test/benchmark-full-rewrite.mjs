import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { withDocument, withRuntime } from './helpers/runtime.mjs';

const [kind, sourcePath, outputPath] = process.argv.slice(2);
assert.ok(kind === 'native' || kind === 'wasm', 'choose native or wasm');
assert.ok(sourcePath, 'usage: node benchmark-full-rewrite.mjs native|wasm input.pdf [output.pdf]');
assert.notEqual(sourcePath, outputPath, 'the output must not replace the source');

const started = performance.now();
function report(stage, values = {}) {
  console.log(
    JSON.stringify({
      stage,
      runtime: kind,
      elapsedMs: Math.round(performance.now() - started),
      peakRssMiB: Math.round(process.resourceUsage().maxRSS / 1024),
      ...values,
    }),
  );
}

function pageDigest({ fn, mem }, page) {
  const bitmap = fn.FPDFBitmap_Create(256, 256, false);
  assert.ok(bitmap);
  try {
    fn.FPDFBitmap_FillRect(bitmap, 0, 0, 256, 256, 0xffffffff);
    fn.FPDF_RenderPageBitmap(bitmap, page, 0, 0, 256, 256, 0, 1);
    const bytes = mem.readBytes(
      fn.FPDFBitmap_GetBuffer(bitmap),
      fn.FPDFBitmap_GetStride(bitmap) * 256,
    );
    return createHash('sha256').update(bytes).digest('hex');
  } finally {
    fn.FPDFBitmap_Destroy(bitmap);
  }
}

const source = new Uint8Array(await readFile(sourcePath));
report('input', { bytes: source.byteLength });
await withRuntime(kind, (runtime) =>
  withDocument(runtime, source, async (document) => {
    const { fn, mem } = runtime;
    const pageCount = fn.FPDF_GetPageCount(document);
    const indexes = [...new Set([0, Math.floor(pageCount / 2), pageCount - 1])];
    const pages = indexes.map((index) => {
      const page = fn.FPDF_LoadPage(document, index);
      assert.ok(page);
      return page;
    });
    const digests = pages.map((page) => pageDigest(runtime, page));
    const sizePtr = mem.alloc(8);
    report('opened', { pageCount });
    try {
      for (let pass = 1; pass <= 2; pass++) {
        mem.poke(sizePtr, 'i32', 0);
        const saveStart = performance.now();
        const output = fn.EPDF_SaveDocumentToOwnedBuffer(document, 2, sizePtr);
        assert.ok(output, 'full rewrite must succeed');
        const size = Number(mem.peek(sizePtr, 'i32')) >>> 0;
        report('saved', { pass, bytes: size, saveMs: Math.round(performance.now() - saveStart) });
        try {
          const reopened = fn.FPDF_LoadMemDocument64(output, size, '');
          assert.ok(reopened, 'saved PDF must reopen');
          try {
            assert.equal(fn.FPDF_GetPageCount(reopened), pageCount);
            for (const [position, index] of indexes.entries()) {
              const page = fn.FPDF_LoadPage(reopened, index);
              assert.ok(page);
              try {
                assert.equal(pageDigest(runtime, page), digests[position], `page ${index}`);
              } finally {
                fn.FPDF_ClosePage(page);
              }
              assert.equal(
                pageDigest(runtime, pages[position]),
                digests[position],
                `live page ${index}`,
              );
            }
          } finally {
            fn.FPDF_CloseDocument(reopened);
          }
          if (outputPath && pass === 1) {
            await writeFile(outputPath, mem.readBytes(output, size), { flag: 'wx' });
          }
        } finally {
          fn.EPDF_FreeBuffer(output);
        }
        report('verified', { pass, sampledPages: indexes });
      }
    } finally {
      mem.free(sizePtr);
      for (const page of pages) {
        fn.FPDF_ClosePage(page);
      }
    }
  }),
);
report('closed');
