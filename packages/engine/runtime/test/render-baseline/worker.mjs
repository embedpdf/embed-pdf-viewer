// Child process that renders documents for render-baseline.mjs.
//
// It owns one runtime, receives one document at a time over IPC and answers with a
// digest per case. After a runtime exception it answers and exits, because a WASM
// instance that aborted (out of memory, for example) cannot be trusted afterwards.

import { readFileSync } from 'node:fs';

import { renderVariant, inspectPage } from './render.mjs';
import { HEAVY_PAGE_OBJECTS, profileByName } from './variants.mjs';

const { runtimeKind, wasmBinary, imageBudgetMb, sliceMs, highHeap } = JSON.parse(process.argv[2]);
const { createPdfRuntime } = await import(new URL('../../dist/index.node.js', import.meta.url));
const runtime = await createPdfRuntime({
  prefer: runtimeKind,
  ...(wasmBinary ? { wasmBinary: readFileSync(wasmBinary) } : {}),
});
if (runtime.kind !== runtimeKind) {
  throw new Error(`asked for the ${runtimeKind} runtime, got ${runtime.kind}`);
}
runtime.fn.FPDF_InitLibrary();
// With the low 2 GiB of the wasm heap taken (never freed), every later
// allocation lands above it, where addresses reach JS as negative i32s.
if (highHeap && runtime.kind === 'wasm') {
  runtime.mem.alloc(2 ** 31 + 64 * 2 ** 20);
  const probe = runtime.mem.alloc(16);
  if (probe < 2n ** 31n) throw new Error(`--high-heap: an allocation landed at ${probe}`);
  runtime.mem.free(probe);
}
// Every case loads its page again, so with a budget each later case of a page
// renders its images from the decodes an earlier case kept, as engine jobs do.
if (imageBudgetMb > 0 && typeof runtime.fn.EPDF_SetDecodedImageBudget === 'function') {
  runtime.fn.EPDF_SetDecodedImageBudget(imageBudgetMb * 1024 * 1024);
}

process.on('message', (message) => {
  if (message.type !== 'document') return;
  const { cases, fatal } = renderDocument(message.document, profileByName(message.profile));
  process.send({ type: 'result', id: message.document.id, cases, fatal }, () => {
    if (fatal) process.exit(0);
  });
});
process.send({ type: 'ready', kind: runtime.kind, platform: runtime.platform });

function renderDocument(document, profile) {
  const { fn, mem } = runtime;
  const cases = {};
  const bytes = readFileSync(document.file);
  const buffer = mem.alloc(bytes.length);
  let doc = 0n;
  try {
    mem.writeBytes(buffer, bytes);
    doc = fn.FPDF_LoadMemDocument64(buffer, bytes.length, '');
    if (!doc) {
      cases[`${document.id}#doc`] = { error: `load-failed:${fn.FPDF_GetLastError()}` };
      return { cases, fatal: false };
    }
    const pageCount = fn.FPDF_GetPageCount(doc);
    cases[`${document.id}#doc`] = { pages: pageCount };
    const pageIndices = document.allPages
      ? Array.from({ length: pageCount }, (_, i) => i)
      : profile.pages(pageCount);
    for (const pageIndex of pageIndices) {
      const info = inspectPage(runtime, doc, pageIndex);
      const heavy = info !== null && info.objects > HEAVY_PAGE_OBJECTS;
      const variants = heavy
        ? profile.variants.filter((variant) => profile.heavy.includes(variant.id))
        : profile.variants;
      for (const variant of variants) {
        const id = `${document.id}#${pageIndex}/${variant.id}`;
        try {
          cases[id] = renderVariant(runtime, doc, pageIndex, variant, { sliceMs });
        } catch (error) {
          cases[id] = { error: `exception:${String(error?.message ?? error).slice(0, 120)}` };
          return { cases, fatal: true };
        }
      }
    }
    return { cases, fatal: false };
  } catch (error) {
    cases[`${document.id}#doc`] = {
      error: `exception:${String(error?.message ?? error).slice(0, 120)}`,
    };
    return { cases, fatal: true };
  } finally {
    try {
      if (doc) fn.FPDF_CloseDocument(doc);
      mem.free(buffer);
    } catch {
      // The runtime already failed; the parent replaces this process.
    }
  }
}
