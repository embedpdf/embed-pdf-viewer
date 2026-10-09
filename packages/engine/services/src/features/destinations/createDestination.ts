import { EngineError, EngineErrorCode, type PdfDestination } from '@embedpdf/engine-core/runtime';
import type { PdfFunctions, PdfRuntimeMemory, Ptr } from '@embedpdf/engine-runtime';
import { NULL_PTR } from '@embedpdf/engine-runtime';

import { VIEW_CODE_BY_KIND } from './destinationViewCodes';
import { withScratch } from '../../runtime/memory/scratch';
import { F32_BYTES } from '../../runtime/memory/structs';

/**
 * Build an indirect explicit-destination array for `dest`. The target page
 * is named by its object number and never loaded: a destination only refers
 * to the page's dictionary.
 */
export function createDestination(
  fn: PdfFunctions,
  mem: PdfRuntimeMemory,
  docPtr: Ptr,
  dest: PdfDestination,
): Ptr {
  const page = dest.page.objectNumber;
  const destPtr =
    dest.kind === 'xyz'
      ? // Absent axes write PDF nulls (spec: "retain current value").
        fn.EPDFDest_CreateXYZByObjectNumber(
          docPtr,
          page,
          dest.left != null,
          dest.left ?? 0,
          dest.top != null,
          dest.top ?? 0,
          dest.zoom != null,
          dest.zoom ?? 0,
        )
      : createViewDestination(fn, mem, docPtr, page, dest);
  if (!destPtr) {
    throw new EngineError(
      EngineErrorCode.NotFound,
      `destination page not found: pageObjectNumber=${page}`,
    );
  }
  return destPtr;
}

function createViewDestination(
  fn: PdfFunctions,
  mem: PdfRuntimeMemory,
  docPtr: Ptr,
  page: number,
  dest: Exclude<PdfDestination, { kind: 'xyz' }>,
): Ptr {
  // The runtime pads a missing param with null up to the fit type's arity:
  // a null top/left writes a PDF null, and the viewer keeps its own.
  const params: number[] = (() => {
    switch (dest.kind) {
      case 'fitH':
      case 'fitBH':
        return dest.top != null ? [dest.top] : [];
      case 'fitV':
      case 'fitBV':
        return dest.left != null ? [dest.left] : [];
      case 'fitR':
        return [dest.left, dest.bottom, dest.right, dest.top];
      default:
        return [];
    }
  })();

  const view = VIEW_CODE_BY_KIND[dest.kind];
  if (!params.length) {
    return fn.EPDFDest_CreateViewByObjectNumber(docPtr, page, view, NULL_PTR, 0);
  }
  return withScratch(mem, params.length * F32_BYTES, (buf) => {
    for (let i = 0; i < params.length; i++) mem.poke(buf, 'f32', params[i]!, i * F32_BYTES);
    return fn.EPDFDest_CreateViewByObjectNumber(docPtr, page, view, buf, params.length);
  });
}
