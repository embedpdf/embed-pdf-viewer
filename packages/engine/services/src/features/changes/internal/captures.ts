import { EngineError, EngineErrorCode } from '@embedpdf/engine-core/runtime';
import type { PdfRuntimeModule, Ptr } from '@embedpdf/engine-runtime';

import { withScratch } from '../../../runtime/memory/scratch';
import { withUtf16String } from '../../../runtime/memory/strings';
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

/**
 * The dictionary `objectNumber` as bytes a guard compares: without
 * `skipKeys`, and under `deepKeys` the objects the layer holds, each stream
 * as it reads. They stay the same while it reads the same, also after a save
 * encoded its streams again or the layer learned its file's hash; never
 * imported.
 */
export function canonicalDict(
  runtime: PdfRuntimeModule,
  docPtr: Ptr,
  objectNumber: number,
  deepKeys: readonly string[],
  skipKeys: readonly string[] = [],
): Uint8Array {
  return takeOwned(runtime, `object ${objectNumber}`, (sizePtr) =>
    runtime.fn.EPDFDoc_ExportDictCanonicalToOwnedBuffer(
      docPtr,
      objectNumber,
      deepKeys.join(' '),
      skipKeys.join(' '),
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

/** An outline item as its delete removes it: the item, the items under it, its place. */
export function exportOutlineItem(
  runtime: PdfRuntimeModule,
  docPtr: Ptr,
  objectNumber: number,
): Uint8Array {
  return takeOwned(runtime, `outline item ${objectNumber}`, (sizePtr) =>
    runtime.fn.EPDFOutline_ExportItemRawToOwnedBuffer(docPtr, objectNumber, sizePtr),
  );
}

/** Puts the outline item of `capture` back, with the items under it, at its place. */
export function importOutlineItem(
  runtime: PdfRuntimeModule,
  docPtr: Ptr,
  capture: Uint8Array,
): void {
  withBytes(runtime, capture, (ptr) => {
    if (!runtime.fn.EPDFOutline_ImportItemRaw(docPtr, ptr, capture.byteLength)) {
      throw new EngineError(EngineErrorCode.Unknown, 'EPDFOutline_ImportItemRaw refused a capture');
    }
  });
}

/** A page as its delete removes it: the page, what it reaches, its names, its place. */
export function exportPage(
  runtime: PdfRuntimeModule,
  docPtr: Ptr,
  pageObjectNumber: number,
): Uint8Array {
  return takeOwned(runtime, `page ${pageObjectNumber}`, (sizePtr) =>
    runtime.fn.EPDFPage_ExportRawToOwnedBuffer(docPtr, pageObjectNumber, sizePtr),
  );
}

/** Puts the page of `capture` back into the page tree, at its place, with its names. */
export function importPage(runtime: PdfRuntimeModule, docPtr: Ptr, capture: Uint8Array): void {
  withBytes(runtime, capture, (ptr) => {
    if (!runtime.fn.EPDFPage_ImportRaw(docPtr, ptr, capture.byteLength)) {
      throw new EngineError(EngineErrorCode.Unknown, 'EPDFPage_ImportRaw refused a capture');
    }
  });
}

/** The embedded file under `key` as its delete removes it: its key, its file specification, its streams. */
export function exportAttachment(runtime: PdfRuntimeModule, docPtr: Ptr, key: string): Uint8Array {
  return takeOwned(runtime, `attachment '${key}'`, (sizePtr) =>
    withUtf16String(runtime.mem, key, (keyPtr) =>
      runtime.fn.EPDFAttachment_ExportRawToOwnedBuffer(docPtr, keyPtr, sizePtr),
    ),
  );
}

/**
 * The embedded file under `key` as bytes a guard compares: the same while it
 * is the same file, as it was (its number included); null when no file has
 * the key. Never imported.
 */
export function canonicalAttachment(
  runtime: PdfRuntimeModule,
  docPtr: Ptr,
  key: string,
): Uint8Array | null {
  try {
    return takeOwned(runtime, `attachment '${key}'`, (sizePtr) =>
      withUtf16String(runtime.mem, key, (keyPtr) =>
        runtime.fn.EPDFAttachment_ExportCanonicalToOwnedBuffer(docPtr, keyPtr, sizePtr),
      ),
    );
  } catch (error) {
    if (EngineError.is(error)) return null;
    throw error;
  }
}

/** Puts the embedded file of `capture` back under its key. */
export function importAttachment(
  runtime: PdfRuntimeModule,
  docPtr: Ptr,
  capture: Uint8Array,
): void {
  withBytes(runtime, capture, (ptr) => {
    if (!runtime.fn.EPDFAttachment_ImportRaw(docPtr, ptr, capture.byteLength)) {
      throw new EngineError(EngineErrorCode.Unknown, 'EPDFAttachment_ImportRaw refused a capture');
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
