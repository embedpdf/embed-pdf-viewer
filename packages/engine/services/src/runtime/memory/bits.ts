/**
 * Coerce a value to an unsigned 32-bit integer. PDFium permission words
 * arrive as signed JS numbers (the high bit makes them negative); reading
 * them as `u32` restores the bit pattern the PDF spec describes.
 */
export function u32(value: number): number {
  return value >>> 0;
}
