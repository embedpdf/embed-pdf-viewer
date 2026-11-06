import type { PdfPermissionFlags } from './types';

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
 * The flags of a `/P` word, as the file is read. `null` (a document not probed yet) gives
 * every flag `false`, the most restrictive reading, so `pdf.permissions` is safe on it.
 */
export function permissionFlagsOf(word: number | null): PdfPermissionFlags {
  if (word === null) {
    return {
      print: false,
      modifyContents: false,
      copy: false,
      modifyAnnotations: false,
      fillForms: false,
      copyForAccessibility: false,
      assemble: false,
      printHighQuality: false,
    };
  }
  return {
    print: (word & PDF_BITS.PRINT) !== 0,
    modifyContents: (word & PDF_BITS.MODIFY) !== 0,
    copy: (word & PDF_BITS.COPY) !== 0,
    modifyAnnotations: (word & PDF_BITS.ANNOTATE_FILL) !== 0,
    fillForms: (word & PDF_BITS.FILL_FORMS) !== 0,
    copyForAccessibility: (word & PDF_BITS.ACCESSIBILITY) !== 0,
    assemble: (word & PDF_BITS.ASSEMBLE) !== 0,
    printHighQuality: (word & PDF_BITS.PRINT_HIGH) !== 0,
  };
}
