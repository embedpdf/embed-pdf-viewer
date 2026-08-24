import type { AnnotationBase } from '../../base';

/**
 * Forward-compat fallback. Emitted whenever the engine encounters a
 * subtype it doesn't (yet) have a dedicated reader for. The wire format
 * is stable: when a per-subtype reader lands later, the engine starts
 * producing the dedicated DTO without breaking older clients.
 */
export interface UnsupportedAnnotationDTO extends AnnotationBase {
  subtype: 'unsupported';
  /** PDFium's `FPDFAnnot_GetSubtype` integer code for diagnostics. */
  rawSubtypeCode: number;
  /** Best-effort string subtype name from the PDF dict, when readable. */
  rawSubtypeName: string | null;
}
