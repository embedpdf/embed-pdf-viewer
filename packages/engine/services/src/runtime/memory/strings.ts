import type { PdfRuntimeMemory, Ptr } from '@embedpdf/engine-runtime';
import { NULL_PTR } from '@embedpdf/engine-runtime';

import { withScratch } from './scratch';

/**
 * Read a PDFium UTF-16LE string getter that uses the standard
 * (probe length, allocate, read) ABI. `call(buf, capacity)` must invoke
 * the native function and return the length in BYTES including the
 * trailing NUL (the value PDFium reports when `capacity` is 0).
 *
 * `emptyAs` decides what a present-but-empty value (`len === 2`, a lone
 * UTF-16 NUL) decodes to. This is the one knob different callers actually
 * disagree on: document Info strings treat `''` as a real value, whereas
 * a page label of `''` is indistinguishable from "absent" and reads as
 * `null`. Making it a parameter keeps that decision explicit instead of
 * forking the buffer dance.
 *
 * Returns `null` when the value is absent (`len <= 0`).
 */
export function readUtf16String(
  mem: PdfRuntimeMemory,
  call: (buf: Ptr, capacity: number) => number,
  emptyAs: '' | null = '',
): string | null {
  const len = call(NULL_PTR, 0);
  if (len <= 0) return null; // absent
  if (len === 2) return emptyAs; // lone UTF-16 NUL
  return withScratch(mem, len, (buf) => {
    const written = call(buf, len);
    if (written <= 0) return null;
    return mem.readU16String(buf);
  });
}

/**
 * UTF-8 sibling of {@link readUtf16String} for the handful of native
 * getters that return UTF-8 (e.g. `EPDF_GetMetaKeyName`). UTF-8 has no
 * fixed empty-NUL width to special-case, so an empty value decodes to
 * `''`; absent (`len <= 0`) is `null`.
 */
export function readUtf8String(
  mem: PdfRuntimeMemory,
  call: (buf: Ptr, capacity: number) => number,
): string | null {
  const len = call(NULL_PTR, 0);
  if (len <= 0) return null;
  return withScratch(mem, len, (buf) => {
    const written = call(buf, len);
    if (written <= 0) return null;
    return mem.readU8String(buf);
  });
}

/**
 * Write side of the UTF-16 convention: encode `value` into a scratch
 * buffer, hand the pointer to `set`, and always free it. `set` returns
 * the native call's success flag, which is propagated.
 */
export function writeUtf16String(
  mem: PdfRuntimeMemory,
  value: string,
  set: (ptr: Ptr) => boolean,
): boolean {
  const ptr = mem.writeU16String(value);
  try {
    return set(ptr);
  } finally {
    mem.free(ptr);
  }
}
