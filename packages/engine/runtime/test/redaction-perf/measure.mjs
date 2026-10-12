// What redacting a scanned document costs. A one-page scan from fixtures/ is
// repeated into a document, saved and opened again (so it reads like a file a
// customer opens), marked over its text lines, applied, and saved in full as a
// download saves it. Used by redaction-perf.mjs (a table) and
// redaction-perf.test.mjs (the CI budgets).
//
// Two ways to apply, as the product does:
//   page  "Apply all": EPDFPage_ApplyRedactions once per page
//   each  one apply per mark: EPDFAnnot_ApplyRedaction, then the page's
//         content written again, as when a user applies marks one by one

import { readFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';

export const KINDS = ['bw-ccitt', 'gray-jpeg', 'color-jpeg', 'gray-jpx', 'color-jpx'];
export const MODES = ['page', 'each'];

const FPDF_ANNOT_REDACT = 28;
const FPDFANNOT_COLORTYPE_InteriorColor = 1;
const FPDF_NO_INCREMENTAL = 2;

const fixture = (name) => new URL(`./fixtures/${name}`, import.meta.url);

/**
 * Measures one kind in one mode on a fresh runtime, so the WASM memory it
 * reports is this run's alone (WASM memory grows and never shrinks: its size
 * at the end is the run's peak).
 */
export async function measureRedaction({ runtime: runtimeKind, kind, mode, pages, marks }) {
  const { createPdfRuntime } = await import(new URL('../../dist/index.node.js', import.meta.url));
  let emscripten = null;
  const runtime = await createPdfRuntime({
    prefer: runtimeKind,
    wasm: {
      onRuntimeInitialized() {
        emscripten = this;
      },
    },
  });
  const { fn, mem } = runtime;
  fn.FPDF_InitLibrary();
  const memoryMiB = () =>
    emscripten
      ? emscripten.HEAP8.buffer.byteLength / 1048576
      : process.resourceUsage().maxRSS / 1024;
  const timed = (work) => {
    const start = performance.now();
    const result = work();
    return [performance.now() - start, result];
  };

  const input = repeatPage(runtime, readFileSync(fixture(`${kind}.pdf`)), pages);
  const inputPtr = mem.alloc(input.length);
  mem.writeBytes(inputPtr, input);
  const doc = fn.FPDF_LoadMemDocument64(inputPtr, input.length, '');
  if (!doc)
    throw new Error(`${kind}: the repeated document does not open (${fn.FPDF_GetLastError()})`);

  const { lines } = JSON.parse(readFileSync(fixture('lines.json'), 'utf8'));
  const placed = addMarks(runtime, doc, lines, pages, marks);
  const openMiB = memoryMiB();

  const count = mem.alloc(8);
  let applyMs = 0;
  let generateMs = 0;
  for (let index = 0; index < pages; index++) {
    const page = fn.FPDF_LoadPage(doc, index);
    if (!page) throw new Error(`${kind}: page ${index} does not load`);
    if (mode === 'page') {
      const [ms, ok] = timed(() => fn.EPDFPage_ApplyRedactions(page, count));
      if (!ok) throw new Error(`${kind}: apply failed on page ${index}`);
      applyMs += ms;
      generateMs += timed(() => fn.FPDFPage_GenerateContent(page))[0];
    } else {
      for (let mark = firstMark(fn, page); mark; mark = firstMark(fn, page)) {
        const [ms, ok] = timed(() => fn.EPDFAnnot_ApplyRedaction(page, mark, count));
        fn.FPDFPage_CloseAnnot(mark);
        if (!ok) throw new Error(`${kind}: apply failed on page ${index}`);
        applyMs += ms;
        generateMs += timed(() => fn.FPDFPage_GenerateContent(page))[0];
      }
    }
    fn.FPDF_ClosePage(page);
  }

  mem.poke(count, 'i32', 0);
  const [saveMs, output] = timed(() =>
    fn.EPDF_SaveDocumentToOwnedBuffer(doc, FPDF_NO_INCREMENTAL, count),
  );
  if (!output) throw new Error(`${kind}: the full save failed`);
  const outputBytes = Number(mem.peek(count, 'i32')) >>> 0;
  const saved = mem.readBytes(output, outputBytes);
  const peakMiB = memoryMiB();

  fn.EPDF_FreeBuffer(output);
  mem.free(count);
  fn.FPDF_CloseDocument(doc);
  mem.free(inputPtr);
  fn.FPDF_DestroyLibrary();
  await runtime.destroy();

  return {
    kind,
    mode,
    runtime: runtimeKind,
    pages,
    marks: placed,
    applyMs: Math.round(applyMs),
    generateMs: Math.round(generateMs),
    saveMs: Math.round(saveMs),
    inputBytes: input.length,
    outputBytes,
    outputRatio: Number((outputBytes / input.length).toFixed(2)),
    openMiB: Math.round(openMiB),
    peakMiB: Math.round(peakMiB),
    saved,
  };
}

// The fixture's page `pages` times, each import a copy of its own (its own
// image), saved and returned as the bytes of a file.
function repeatPage({ fn, mem }, bytes, pages) {
  const sourcePtr = mem.alloc(bytes.length);
  mem.writeBytes(sourcePtr, new Uint8Array(bytes));
  const source = fn.FPDF_LoadMemDocument64(sourcePtr, bytes.length, '');
  const target = fn.FPDF_CreateNewDocument();
  const first = mem.alloc(4);
  mem.poke(first, 'i32', 0);
  const size = mem.alloc(8);
  try {
    if (!source || !target) throw new Error('cannot open the fixture');
    for (let index = 0; index < pages; index++) {
      if (!fn.FPDF_ImportPagesByIndex(target, source, first, 1, index)) {
        throw new Error('cannot repeat the fixture page');
      }
    }
    const saved = fn.EPDF_SaveDocumentToOwnedBuffer(target, FPDF_NO_INCREMENTAL, size);
    if (!saved) throw new Error('cannot save the repeated document');
    const result = mem.readBytes(saved, Number(mem.peek(size, 'i32')) >>> 0);
    fn.EPDF_FreeBuffer(saved);
    return result;
  } finally {
    mem.free(size);
    mem.free(first);
    if (target) fn.FPDF_CloseDocument(target);
    if (source) fn.FPDF_CloseDocument(source);
    mem.free(sourcePtr);
  }
}

// `marks` black redact marks spread evenly over the pages, each over part of a
// text line (40 to 220 points of it), placed by a fixed seed.
function addMarks({ fn, mem }, doc, lines, pages, marks) {
  const random = seeded(12345);
  const rect = mem.alloc(16);
  let placed = 0;
  try {
    for (let index = 0; index < pages; index++) {
      const here = Math.floor(((index + 1) * marks) / pages) - Math.floor((index * marks) / pages);
      if (here === 0) continue;
      const page = fn.FPDF_LoadPage(doc, index);
      for (let n = 0; n < here; n++) {
        const [left, bottom, right, top] = lines[Math.floor(random() * lines.length)];
        const width = Math.min(right - left, 40 + random() * 180);
        const x = left + random() * (right - left - width);
        const mark = fn.FPDFPage_CreateAnnot(page, FPDF_ANNOT_REDACT);
        if (!mark) throw new Error('cannot create a redact mark');
        // FS_RECTF: left, top, right, bottom.
        [x, top, x + width, bottom].forEach((value, at) => mem.poke(rect, 'f32', value, at * 4));
        fn.FPDFAnnot_SetRect(mark, rect);
        fn.FPDFAnnot_SetColor(mark, FPDFANNOT_COLORTYPE_InteriorColor, 0, 0, 0, 255);
        fn.FPDFPage_CloseAnnot(mark);
        placed++;
      }
      fn.FPDF_ClosePage(page);
    }
  } finally {
    mem.free(rect);
  }
  return placed;
}

function firstMark(fn, page) {
  const count = fn.FPDFPage_GetAnnotCount(page);
  for (let index = 0; index < count; index++) {
    const annot = fn.FPDFPage_GetAnnot(page, index);
    if (fn.FPDFAnnot_GetSubtype(annot) === FPDF_ANNOT_REDACT) return annot;
    fn.FPDFPage_CloseAnnot(annot);
  }
  return null;
}

// mulberry32: the same marks on every run and runtime.
function seeded(seed) {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
