import type { PdfBits } from './types';

/**
 * ISO 32000 user-access permission bit positions, expressed as integer
 * masks. Bit numbers in the spec are 1-indexed, so bit 3 = `1 << 2`.
 *
 * Bits 1, 2, 7, 8, and 13+ are reserved and not surfaced here.
 */
export const PDF_BITS = {
  /** Bit 3 — print the document. */
  PRINT: 1 << 2,
  /** Bit 4 — modify content streams. */
  MODIFY: 1 << 3,
  /** Bit 5 — copy/extract text and graphics. */
  COPY: 1 << 4,
  /** Bit 6 — annotate + fill forms (+ modify form fields with bit 4). */
  ANNOTATE_FILL: 1 << 5,
  /** Bit 9 — fill existing forms (even if bit 6 is clear). */
  FILL_FORMS: 1 << 8,
  /** Bit 10 — accessibility extraction (deprecated in PDF 2.0). */
  ACCESSIBILITY: 1 << 9,
  /** Bit 11 — assemble document (insert/rotate/delete pages, outline). */
  ASSEMBLE: 1 << 10,
  /** Bit 12 — high-quality print (refines bit 3). */
  PRINT_HIGH: 1 << 11,
} as const;

/**
 * Decode a raw PDFium permission integer into a typed boolean view.
 *
 * `null` input (the documents row column is nullable until probed)
 * yields all-false bits — i.e., a maximally restrictive interpretation.
 * That keeps `pdf.permissions` expansion safe on unprobed documents.
 */
export function decodePdfBits(raw: number | null): PdfBits {
  if (raw === null) {
    return {
      bit3: false,
      bit4: false,
      bit5: false,
      bit6: false,
      bit9: false,
      bit10: false,
      bit11: false,
      bit12: false,
    };
  }
  return {
    bit3: (raw & PDF_BITS.PRINT) !== 0,
    bit4: (raw & PDF_BITS.MODIFY) !== 0,
    bit5: (raw & PDF_BITS.COPY) !== 0,
    bit6: (raw & PDF_BITS.ANNOTATE_FILL) !== 0,
    bit9: (raw & PDF_BITS.FILL_FORMS) !== 0,
    bit10: (raw & PDF_BITS.ACCESSIBILITY) !== 0,
    bit11: (raw & PDF_BITS.ASSEMBLE) !== 0,
    bit12: (raw & PDF_BITS.PRINT_HIGH) !== 0,
  };
}
