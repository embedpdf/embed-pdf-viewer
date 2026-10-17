import { EngineError, EngineErrorCode } from '@embedpdf/engine-core/runtime';
import type { PdfRuntimeModule, Ptr } from '@embedpdf/engine-runtime';

import { withScratch } from '../../../runtime/memory/scratch';
import { U64_BYTES, pokeU64 } from '../../../runtime/memory/u64';

/**
 * The fork's captures (`public/epdf_capture.h`): the layer's own versions of
 * what a write is about to lose or replace, as bytes, and their import, which
 * puts them back where the layer holds no version now. Which objects to
 * capture, and when an import is allowed, is the engine's decision; these
 * only move the bytes. Every import runs inside the change's transaction.
 */

/** The annotations at `indexes` of a page, with their positions: what a delete removes. */
export function exportAnnots(
  runtime: PdfRuntimeModule,
  docPtr: Ptr,
  pageIndex: number,
  indexes: readonly number[],
): Uint8Array {
  const { fn, mem } = runtime;
  return withScratch(mem, Math.max(4, 4 * indexes.length), (indexesPtr) => {
    indexes.forEach((index, i) => mem.poke(indexesPtr, 'i32', index, 4 * i));
    return takeOwned(runtime, 'annotations', (sizePtr) =>
      fn.EPDFPage_ExportAnnotsRawToOwnedBuffer(
        docPtr,
        pageIndex,
        indexesPtr,
        indexes.length,
        sizePtr,
      ),
    );
  });
}

/** Puts the annotations of `capture` back on the page, at their positions. */
export function importAnnots(
  runtime: PdfRuntimeModule,
  docPtr: Ptr,
  pageIndex: number,
  capture: Uint8Array,
): void {
  withBytes(runtime, capture, (ptr) => {
    if (!runtime.fn.EPDFPage_ImportAnnotsRaw(docPtr, pageIndex, ptr, capture.byteLength)) {
      throw new EngineError(EngineErrorCode.Unknown, 'EPDFPage_ImportAnnotsRaw refused a capture');
    }
  });
}

/**
 * The dictionary `objectNumber` as it reads now, and the objects under
 * `deepKeys` (such as `/AP`) that the layer holds: what an update replaces.
 */
export function exportDict(
  runtime: PdfRuntimeModule,
  docPtr: Ptr,
  objectNumber: number,
  deepKeys: readonly string[],
): Uint8Array {
  return takeOwned(runtime, `object ${objectNumber}`, (sizePtr) =>
    runtime.fn.EPDFDoc_ExportDictRawToOwnedBuffer(
      docPtr,
      objectNumber,
      deepKeys.join(' '),
      sizePtr,
    ),
  );
}

/** Puts the dictionary of `capture` back as it was: exactly its keys. */
export function importDict(runtime: PdfRuntimeModule, docPtr: Ptr, capture: Uint8Array): void {
  withBytes(runtime, capture, (ptr) => {
    if (!runtime.fn.EPDFDoc_ImportDictRaw(docPtr, ptr, capture.byteLength)) {
      throw new EngineError(EngineErrorCode.Unknown, 'EPDFDoc_ImportDictRaw refused a capture');
    }
  });
}

/** A terminal field as its delete removes it: the field, its widgets, the parents it prunes. */
export function exportField(
  runtime: PdfRuntimeModule,
  docPtr: Ptr,
  fieldObjectNumber: number,
): Uint8Array {
  return takeOwned(runtime, `field ${fieldObjectNumber}`, (sizePtr) =>
    runtime.fn.EPDFForm_ExportFieldRawToOwnedBuffer(docPtr, fieldObjectNumber, sizePtr),
  );
}

/** Puts the field of `capture` back into the form and its widgets onto their pages. */
export function importField(runtime: PdfRuntimeModule, docPtr: Ptr, capture: Uint8Array): void {
  withBytes(runtime, capture, (ptr) => {
    if (!runtime.fn.EPDFForm_ImportFieldRaw(docPtr, ptr, capture.byteLength)) {
      throw new EngineError(EngineErrorCode.Unknown, 'EPDFForm_ImportFieldRaw refused a capture');
    }
  });
}

/** The bytes of a buffer an export returned, which is then released. */
function takeOwned(
  runtime: PdfRuntimeModule,
  what: string,
  call: (sizePtr: Ptr) => Ptr | null,
): Uint8Array {
  const { fn, mem } = runtime;
  return withScratch(mem, U64_BYTES, (sizePtr) => {
    // `unsigned long*`: 8 bytes on native, 4 on wasm32. Zero the whole slot.
    pokeU64(mem, sizePtr, 0);
    const bufferPtr = call(sizePtr);
    if (!bufferPtr) {
      throw new EngineError(EngineErrorCode.Unknown, `the capture of ${what} failed`);
    }
    try {
      return mem.readBytes(bufferPtr, Number(mem.peek(sizePtr, 'i32'))).slice();
    } finally {
      fn.EPDF_FreeBuffer(bufferPtr);
    }
  });
}

/** `bytes` copied into the runtime's memory for the length of `body`. */
function withBytes<T>(runtime: PdfRuntimeModule, bytes: Uint8Array, body: (ptr: Ptr) => T): T {
  const { mem } = runtime;
  return withScratch(mem, Math.max(1, bytes.byteLength), (ptr) => {
    mem.writeBytes(ptr, bytes);
    return body(ptr);
  });
}
