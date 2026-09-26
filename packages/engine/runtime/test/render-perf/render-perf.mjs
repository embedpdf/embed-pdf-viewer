// Times what a viewer session costs on a page: the 640 px base render, 20 zoomed tiles,
// 12 deep-zoom tiles, and the base again.
//
//   node test/render-perf/render-perf.mjs --runtime wasm [--mode fresh|kept] file.pdf ...
//
// `fresh` loads and closes the page for every render, as the engine does per job.
// `kept` loads the page once and renders everything on it.
// Options: --page <index> (default 0), --wasm-binary <file>, --out <file.json>.
// Load, render and close are timed separately; the WASM heap size (or the process's
// peak RSS for the native runtime) is reported after each stage.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';

import { loadEnginePage, renderEngineOnPage } from '../render-baseline/render.mjs';

const args = parseArgs(process.argv.slice(2));
const runtimeKind = args.runtime ?? 'wasm';
const mode = args.mode ?? 'fresh';
const pageIndex = Number(args.page ?? 0);
if (args._.length === 0 || (mode !== 'fresh' && mode !== 'kept')) {
  console.error('usage: render-perf.mjs --runtime native|wasm [--mode fresh|kept] file.pdf ...');
  process.exit(2);
}

let emscriptenModule = null;
const { createPdfRuntime } = await import(new URL('../../dist/index.node.js', import.meta.url));
const runtime = await createPdfRuntime({
  prefer: runtimeKind,
  ...(args['wasm-binary'] ? { wasmBinary: readFileSync(args['wasm-binary']) } : {}),
  wasm: {
    onRuntimeInitialized() {
      emscriptenModule = this;
    },
  },
});
runtime.fn.FPDF_InitLibrary();

const reports = [];
for (const file of args._) reports.push(measure(file));
if (args.out) {
  mkdirSync(path.dirname(path.resolve(args.out)), { recursive: true });
  writeFileSync(args.out, `${JSON.stringify({ runtime: runtimeKind, mode, reports }, null, 1)}\n`);
}

function measure(file) {
  const { fn, mem } = runtime;
  const bytes = readFileSync(file);
  const buffer = mem.alloc(bytes.length);
  mem.writeBytes(buffer, bytes);
  const doc = fn.FPDF_LoadMemDocument64(buffer, bytes.length, '');
  if (!doc) throw new Error(`cannot open ${file}: ${fn.FPDF_GetLastError()}`);

  const stages = [];
  let kept = 0n;
  let objects = 0;
  const run = (name, variants) => {
    const stage = { name, renders: variants.length, loadMs: 0, renderMs: 0, closeMs: 0 };
    for (const variant of variants) {
      let page = kept;
      if (!page) {
        const t = performance.now();
        page = loadEnginePage(fn, doc, pageIndex);
        stage.loadMs += performance.now() - t;
        if (!page) throw new Error(`cannot load page ${pageIndex} of ${file}`);
        objects = fn.FPDFPage_CountObjects(page);
        if (mode === 'kept') kept = page;
      }
      const t = performance.now();
      const result = renderEngineOnPage(runtime, page, variant);
      stage.renderMs += performance.now() - t;
      if (result.error) throw new Error(`${name}: ${result.error}`);
      if (mode === 'fresh') {
        const c = performance.now();
        fn.FPDF_ClosePage(page);
        stage.closeMs += performance.now() - c;
      }
    }
    stage.heapMiB = heapMiB();
    stages.push(stage);
  };

  const base = {
    kind: 'engine',
    region: 'page',
    viewport: { kind: 'width', width: 640 },
    rotation: 0,
    flags: 0x11,
  };
  run('base 640', [base]);
  run('20 tiles at 6400 px wide', tileGrid(fn, doc, 6400, 5, 4));
  run('12 tiles at 25600 px wide', tileGrid(fn, doc, 25600, 4, 3));
  run('base 640 again', [base]);
  if (kept) {
    const c = performance.now();
    fn.FPDF_ClosePage(kept);
    stages.push({
      name: 'close kept page',
      renders: 0,
      loadMs: 0,
      renderMs: 0,
      closeMs: performance.now() - c,
      heapMiB: heapMiB(),
    });
  }
  fn.FPDF_CloseDocument(doc);
  mem.free(buffer);

  const total = stages.reduce(
    (sum, stage) => sum + stage.loadMs + stage.renderMs + stage.closeMs,
    0,
  );
  console.log(
    `\n${path.basename(file)} page ${pageIndex}: ${objects} objects, ${runtimeKind}, ${mode}`,
  );
  console.log(
    '  stage                          renders    load ms  render ms   close ms   heap MiB',
  );
  for (const s of stages) {
    console.log(
      `  ${s.name.padEnd(30)} ${String(s.renders).padStart(7)} ${ms(s.loadMs)} ${ms(s.renderMs)} ${ms(s.closeMs)} ${String(s.heapMiB).padStart(10)}`,
    );
  }
  console.log(`  total ${Math.round(total)} ms`);
  return {
    file: path.basename(file),
    page: pageIndex,
    objects,
    stages,
    totalMs: Math.round(total),
  };
}

// A cols × rows grid of 512 px tiles (with the viewer's 1 px bleed) around the centre
// of the page rendered `pageWidthPx` device pixels wide.
function tileGrid(fn, doc, pageWidthPx, cols, rows) {
  const { width, height } = pageSize(fn, doc);
  const scale = pageWidthPx / width;
  const side = 512 / scale;
  const tiles = [];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      tiles.push({
        kind: 'engine',
        region: {
          fx: 0.5 + ((col - cols / 2) * side) / width,
          fy: 0.5 + ((row - rows / 2) * side) / height,
          size: 512,
          bleed: 1,
        },
        viewport: { kind: 'scale', scale },
        rotation: 0,
        flags: 0x11,
      });
    }
  }
  return tiles;
}

// The page size with rotation normalized to 0, read without parsing the page.
function pageSize(fn, doc) {
  const { mem } = runtime;
  const size = mem.alloc(8);
  try {
    if (!fn.EPDF_GetPageSizeByIndexNormalized(doc, pageIndex, size)) {
      throw new Error(`no page ${pageIndex}`);
    }
    return { width: mem.peek(size, 'f32', 0), height: mem.peek(size, 'f32', 4) };
  } finally {
    mem.free(size);
  }
}

function heapMiB() {
  if (emscriptenModule?.HEAPU8) return Math.round(emscriptenModule.HEAPU8.length / 1048576);
  return Math.round(process.resourceUsage().maxRSS / 1024);
}

function ms(value) {
  return String(Math.round(value)).padStart(10);
}

function parseArgs(argv) {
  const parsed = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith('--')) parsed[arg.slice(2)] = argv[++i];
    else parsed._.push(arg);
  }
  return parsed;
}
