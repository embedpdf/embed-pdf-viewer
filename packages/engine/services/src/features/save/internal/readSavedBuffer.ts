import type { PdfRuntimeMemory, Ptr } from '@embedpdf/engine-runtime';

/** Keep the runtime's owned copy when it already occupies an entire ArrayBuffer. */
export function readSavedBuffer(mem: PdfRuntimeMemory, ptr: Ptr, size: number): ArrayBuffer {
  const bytes = mem.readBytes(ptr, size);
  if (
    bytes.buffer instanceof ArrayBuffer &&
    bytes.byteOffset === 0 &&
    bytes.byteLength === bytes.buffer.byteLength
  ) {
    return bytes.buffer;
  }

  return new Uint8Array(bytes).buffer;
}
