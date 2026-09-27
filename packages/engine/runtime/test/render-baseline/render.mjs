// Renders one variant of one page and returns the SHA-256 of the bitmap bytes.
//
// Every render loads its own page and closes it afterwards, the way the engine does
// for each job, so no render can see state left behind by another one.

import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';

const FPDF_BITMAP_BGRA = 4;
const FPDF_RENDER_TOBECONTINUED = 1;
const FPDF_RENDER_DONE = 2;

/**
 * Renders a variant. With `options.sliceMs`, `engine` variants render in slices of
 * that many milliseconds (`EPDF_RenderPageBitmapWithMatrix_Start`), as the engine
 * renders a page, and report how many slices they took and the longest one.
 */
export function renderVariant(runtime, doc, pageIndex, variant, options = {}) {
  const started = performance.now();
  const result =
    variant.kind === 'engine'
      ? renderEngine(runtime, doc, pageIndex, variant, options)
      : renderClassic(runtime, doc, pageIndex, variant);
  return { ...result, ms: Math.round(performance.now() - started) };
}

/** Loads a page the way the engine does and reports its object count. */
export function inspectPage({ fn }, doc, pageIndex) {
  const page = loadEnginePage(fn, doc, pageIndex);
  if (!page) return null;
  try {
    return { objects: fn.FPDFPage_CountObjects(page) };
  } finally {
    fn.FPDF_ClosePage(page);
  }
}

/** Loads a page with its rotation normalized to 0, as the engine does; 0n when it fails. */
export function loadEnginePage(fn, doc, pageIndex) {
  const objectNumber = fn.EPDFDoc_GetPageObjectNumberByIndex(doc, pageIndex);
  if (objectNumber <= 0) return 0n;
  return fn.EPDFDoc_LoadPageByObjectNumberNormalized(doc, objectNumber);
}

function renderEngine(runtime, doc, pageIndex, variant, options) {
  const page = loadEnginePage(runtime.fn, doc, pageIndex);
  if (!page) return { error: 'page-load-failed' };
  try {
    return renderEngineOnPage(runtime, page, variant, options);
  } finally {
    runtime.fn.FPDF_ClosePage(page);
  }
}

/** Renders an `engine` variant on a page the caller loaded and closes. */
export function renderEngineOnPage(runtime, page, variant, options = {}) {
  const { fn, mem } = runtime;
  const pageWidth = fn.FPDF_GetPageWidthF(page);
  const pageHeight = fn.FPDF_GetPageHeightF(page);
  const rect = regionRect(variant, pageWidth, pageHeight);
  const displayRect = {
    left: rect.left,
    right: rect.right,
    bottom: pageHeight - rect.top,
    top: pageHeight - rect.bottom,
  };
  const { width, height } = deviceSize(displayRect, variant.rotation, variant.viewport);
  const matrix = displayRectToDeviceMatrix(displayRect, variant.rotation, width, height);

  const bitmap = fn.FPDFBitmap_CreateEx(width, height, FPDF_BITMAP_BGRA, 0n, 0);
  if (!bitmap) return { error: 'bitmap-failed', width, height };
  const matrixPtr = mem.alloc(24);
  const clipPtr = mem.alloc(16);
  try {
    fn.FPDFBitmap_FillRect(bitmap, 0, 0, width, height, 0xffffffff);
    matrix.forEach((value, i) => mem.poke(matrixPtr, 'f32', value, i * 4));
    [0, 0, width, height].forEach((value, i) => mem.poke(clipPtr, 'f32', value, i * 4));
    if (options.sliceMs === undefined) {
      fn.FPDF_RenderPageBitmapWithMatrix(bitmap, page, matrixPtr, clipPtr, variant.flags);
      return { sha: digest(runtime, bitmap, height), width, height };
    }
    const slices = renderSliced(fn, bitmap, page, matrixPtr, clipPtr, variant.flags, options);
    if (slices.error) return { error: slices.error, width, height };
    return { sha: digest(runtime, bitmap, height), width, height, ...slices };
  } finally {
    mem.free(clipPtr);
    mem.free(matrixPtr);
    fn.FPDFBitmap_Destroy(bitmap);
  }
}

function renderSliced(fn, bitmap, page, matrixPtr, clipPtr, flags, { sliceMs }) {
  let slices = 0;
  let longestSliceMs = 0;
  const slice = (render) => {
    const started = performance.now();
    const status = render();
    longestSliceMs = Math.max(longestSliceMs, performance.now() - started);
    slices++;
    return status;
  };
  try {
    let status = slice(() =>
      fn.EPDF_RenderPageBitmapWithMatrix_Start(bitmap, page, matrixPtr, clipPtr, flags, sliceMs),
    );
    while (status === FPDF_RENDER_TOBECONTINUED) {
      status = slice(() => fn.EPDF_RenderPage_Continue(page, sliceMs));
    }
    if (status !== FPDF_RENDER_DONE) return { error: `sliced-render-status:${status}` };
    return { slices, longestSliceMs: Math.round(longestSliceMs * 10) / 10 };
  } finally {
    fn.FPDF_RenderPage_Close(page);
  }
}

function renderClassic(runtime, doc, pageIndex, variant) {
  const { fn } = runtime;
  const page = fn.FPDF_LoadPage(doc, pageIndex);
  if (!page) return { error: 'page-load-failed' };
  try {
    const quarterTurn = variant.rotate % 2 === 1;
    const baseWidth = quarterTurn ? fn.FPDF_GetPageHeightF(page) : fn.FPDF_GetPageWidthF(page);
    const baseHeight = quarterTurn ? fn.FPDF_GetPageWidthF(page) : fn.FPDF_GetPageHeightF(page);
    const width = variant.width;
    const height = Math.max(1, Math.round((width * baseHeight) / baseWidth));
    const bitmap = fn.FPDFBitmap_Create(width, height, variant.format === 'bgra' ? 1 : 0);
    if (!bitmap) return { error: 'bitmap-failed', width, height };
    try {
      fn.FPDFBitmap_FillRect(bitmap, 0, 0, width, height, 0xffffffff);
      fn.FPDF_RenderPageBitmap(bitmap, page, 0, 0, width, height, variant.rotate, variant.flags);
      return { sha: digest(runtime, bitmap, height), width, height };
    } finally {
      fn.FPDFBitmap_Destroy(bitmap);
    }
  } finally {
    fn.FPDF_ClosePage(page);
  }
}

function digest({ fn, mem }, bitmap, height) {
  const bytes = mem.readBytes(
    fn.FPDFBitmap_GetBuffer(bitmap),
    fn.FPDFBitmap_GetStride(bitmap) * height,
  );
  return createHash('sha256').update(bytes).digest('hex');
}

// The PDF-space rectangle a variant renders: the whole page, or a tile anchored at a
// fraction of the page and kept inside it where the page is large enough.
function regionRect(variant, pageWidth, pageHeight) {
  if (variant.region === 'page') {
    return { left: 0, bottom: 0, right: pageWidth, top: pageHeight };
  }
  const { fx, fy, size, bleed } = variant.region;
  const scale = variant.viewport.scale;
  const side = size / scale;
  const pad = bleed / scale;
  const left = Math.max(0, Math.min(pageWidth * fx, pageWidth - side));
  const bottom = Math.max(0, Math.min(pageHeight * fy, pageHeight - side));
  return {
    left: left - pad,
    bottom: bottom - pad,
    right: Math.min(left + side, pageWidth) + pad,
    top: Math.min(bottom + side, pageHeight) + pad,
  };
}

// Same arithmetic as the engine's `deviceSize` in
// packages/engine/services/src/features/render/deviceRaster.ts.
function deviceSize(rect, rotation, viewport) {
  const rectWidth = rect.right - rect.left;
  const rectHeight = rect.top - rect.bottom;
  const swap = rotation === 90 || rotation === 270;
  const baseWidth = swap ? rectHeight : rectWidth;
  const baseHeight = swap ? rectWidth : rectHeight;
  if (viewport.kind === 'width') {
    const width = Math.max(1, Math.round(viewport.width));
    return { width, height: Math.max(1, Math.round((width * baseHeight) / baseWidth)) };
  }
  return {
    width: Math.max(1, Math.round(baseWidth * viewport.scale)),
    height: Math.max(1, Math.round(baseHeight * viewport.scale)),
  };
}

// Same arithmetic as the engine's `displayRectToDeviceMatrix` in
// packages/engine/services/src/features/render/deviceRaster.ts.
function displayRectToDeviceMatrix(rect, rotation, outW, outH) {
  const { left, bottom } = rect;
  const width = rect.right - rect.left;
  const height = rect.top - rect.bottom;
  const sx0 = outW / width;
  const sy0 = outH / height;
  const sx90 = outW / height;
  const sy90 = outH / width;
  switch (rotation) {
    case 90:
      return [0, sy90, -sx90, 0, sx90 * (bottom + height), -sy90 * left];
    case 180:
      return [-sx0, 0, 0, -sy0, sx0 * (left + width), sy0 * (bottom + height)];
    case 270:
      return [0, -sy90, sx90, 0, -sx90 * bottom, sy90 * (left + width)];
    default:
      return [sx0, 0, 0, sy0, -sx0 * left, -sy0 * bottom];
  }
}
