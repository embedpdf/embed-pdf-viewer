import type { PdfRuntimeMemory, Ptr } from '@embedpdf/engine-runtime';

/** `FS_RECTF { float left, top, right, bottom }` → 16 bytes. */
export const RECTF_BYTES = 16;
/** `FS_SIZEF { float width, height }` → 8 bytes. */
export const SIZEF_BYTES = 8;
/** A single 32-bit float (e.g. a user-unit out-parameter). */
export const F32_BYTES = 4;
/** A single 32-bit int (e.g. a color channel out-parameter). */
export const I32_BYTES = 4;
/** `FS_QUADPOINTSF` — 8 floats → 32 bytes. */
export const QUADPOINTSF_BYTES = 32;
/** `FS_POINTF { float x, y }` → 8 bytes. */
export const POINTF_BYTES = 8;

export interface RectF {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface SizeF {
  width: number;
  height: number;
}

/** Decode an `FS_RECTF` struct that a native call wrote into `ptr`. */
export function readRectF(mem: PdfRuntimeMemory, ptr: Ptr): RectF {
  return {
    left: readF32(mem, ptr, 0),
    top: readF32(mem, ptr, 4),
    right: readF32(mem, ptr, 8),
    bottom: readF32(mem, ptr, 12),
  };
}

/** Decode an `FS_SIZEF` struct that a native call wrote into `ptr`. */
export function readSizeF(mem: PdfRuntimeMemory, ptr: Ptr): SizeF {
  return {
    width: readF32(mem, ptr, 0),
    height: readF32(mem, ptr, 4),
  };
}

/** Read a single 32-bit float at `byteOffset` within `ptr`. */
export function readF32(mem: PdfRuntimeMemory, ptr: Ptr, byteOffset = 0): number {
  return Number(mem.peek(ptr, 'f32', byteOffset));
}

/** Read a single 32-bit int at `byteOffset` within `ptr`. */
export function readI32(mem: PdfRuntimeMemory, ptr: Ptr, byteOffset = 0): number {
  return Number(mem.peek(ptr, 'i32', byteOffset));
}
