import type { AnnotationReplyType } from '@embedpdf/engine-core/runtime';

/**
 * `/RT` (reply type) codec between the wire-stable {@link AnnotationReplyType}
 * strings and PDFium's `FPDF_ANNOT_REPLY_TYPE` integer codes (see
 * `public/fpdf_annot.h`). Kept in engine-services so engine-core stays
 * PDFium-free.
 *
 *   0  FPDF_ANNOT_RT_UNKNOWN  (RT absent / unrecognized)
 *   1  FPDF_ANNOT_RT_REPLY    /R     — the ISO default when /RT is missing
 *   2  FPDF_ANNOT_RT_GROUP    /Group
 */
export const RT_UNKNOWN = 0;
export const RT_REPLY = 1;
export const RT_GROUP = 2;

/**
 * Map a PDFium reply-type code to the wire string, GATED on the presence
 * of `/IRT`. PDFium's `EPDFAnnot_GetReplyType` returns `RT_REPLY` even
 * when there is no `/IRT` (it reports the `/RT` default in isolation), so
 * callers must only invoke this for annotations that actually carry an
 * `/IRT` link. `RT_GROUP` -> `'group'`; everything else -> `'reply'`.
 */
export function replyTypeFromCode(code: number): AnnotationReplyType {
  return code === RT_GROUP ? 'group' : 'reply';
}

/** Map the wire string to the PDFium code written via `EPDFAnnot_SetReplyType`. */
export function replyTypeToCode(replyType: AnnotationReplyType): number {
  return replyType === 'group' ? RT_GROUP : RT_REPLY;
}
