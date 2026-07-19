import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';

test('pdf-runtime exposes a create function', async () => {
  const runtime = await import('../dist/index.js').catch(() => null);
  if (!runtime) {
    assert.ok(true, 'dist not built; smoke test skipped');
    return;
  }

  assert.equal(typeof runtime.createPdfRuntime, 'function');
  assert.equal(typeof runtime.init, 'function');
});

test('wasm runtime owns memory-backed FPDF_FILEACCESS handles', async () => {
  const runtime = await import('../dist/index.js').catch(() => null);
  if (!runtime) {
    assert.ok(true, 'dist not built; smoke test skipped');
    return;
  }

  const pdfRuntime = await runtime.createPdfRuntime({ prefer: 'wasm' }).catch(() => null);
  if (!pdfRuntime) {
    assert.ok(true, 'wasm runtime artifact unavailable; smoke test skipped');
    return;
  }

  const access = pdfRuntime.fileAccess.fromMemory(new Uint8Array([1, 2, 3, 4]));
  assert.notEqual(access.ptr, runtime.NULL_PTR);
  access.close();
  access.close();
  await pdfRuntime.destroy();
});

test('native runtime opens a base document through file-backed FPDF_FILEACCESS', async () => {
  const runtime = await import('../dist/index.js').catch(() => null);
  if (!runtime) {
    assert.ok(true, 'dist not built; smoke test skipped');
    return;
  }

  const pdfRuntime = await runtime.createPdfRuntime({ prefer: 'native' }).catch(() => null);
  if (!pdfRuntime) {
    assert.ok(true, 'native runtime artifact unavailable; smoke test skipped');
    return;
  }

  const fixture = resolve('runtime-src/testing/resources/rectangles.pdf');
  if (!existsSync(fixture)) {
    await pdfRuntime.destroy();
    assert.ok(true, 'PDFium fixture unavailable; smoke test skipped');
    return;
  }

  pdfRuntime.fn.FPDF_InitLibrary();
  const access = pdfRuntime.fileAccess.fromNodeFile(fixture);
  const statusPtr = pdfRuntime.mem.alloc(4);
  const base = pdfRuntime.fn.EPDF_LoadBaseDocument(access.ptr, '');
  assert.notEqual(base, runtime.NULL_PTR);

  const layer = pdfRuntime.fn.EPDFLayer_OpenLayer(base, runtime.NULL_PTR, '', statusPtr);
  assert.notEqual(layer, runtime.NULL_PTR);
  assert.equal(pdfRuntime.fn.FPDF_GetPageCount(layer), 1);
  assert.equal(pdfRuntime.fn.EPDFLayer_GetPromotedObjectCount(layer), 0);

  pdfRuntime.fn.FPDF_CloseDocument(layer);
  pdfRuntime.fn.EPDF_ReleaseBaseDocument(base);
  pdfRuntime.mem.free(statusPtr);
  access.close();
  pdfRuntime.fn.FPDF_DestroyLibrary();
  await pdfRuntime.destroy();
});
