/**
 * Stamp `/Name` label ↔ `FPDF_ANNOT_NAME` enum code mapping for the
 * `EPDFAnnot_SetName` / `EPDFAnnot_GetName` fork helpers. Labels are the
 * PDF spec / Adobe literal name values (ISO 32000 §12.5.6.12 table 181
 * plus the Adobe SB/SH extended set the fork supports). Codes mirror the
 * `FPDF_ANNOT_NAME` enum in `public/fpdf_annot.h` — same pattern as
 * `lineEnding.ts` keeping engine-core PDFium-free.
 */

export const STAMP_NAME_TO_CODE: Readonly<Record<string, number>> = Object.freeze({
  Approved: 13,
  Experimental: 14,
  NotApproved: 15,
  AsIs: 16,
  Expired: 17,
  NotForPublicRelease: 18,
  Confidential: 19,
  Final: 20,
  Sold: 21,
  Departmental: 22,
  ForComment: 23,
  TopSecret: 24,
  Draft: 25,
  ForPublicRelease: 26,
  Completed: 27,
  Void: 28,
  PreliminaryResults: 29,
  InformationOnly: 30,
  Rejected: 31,
  Witness: 32,
  InitialHere: 33,
  SignHere: 34,
  Accepted: 35,
});

export const STAMP_CODE_TO_NAME: Readonly<Record<number, string>> = Object.freeze(
  Object.fromEntries(Object.entries(STAMP_NAME_TO_CODE).map(([name, code]) => [code, name])),
);

export function isKnownStampName(name: string): boolean {
  return Object.prototype.hasOwnProperty.call(STAMP_NAME_TO_CODE, name);
}
