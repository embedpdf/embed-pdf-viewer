/**
 * The PDF standard stamp `/Name` set (ISO 32000-2 table 187 plus the
 * Adobe SB/SH extended names the fork draws). Informational only: the
 * predefined set is a READER's rendering obligation, and `/Name` accepts
 * any name — Acrobat library identifiers such as '#LBGiYhk8V_oAfmqAPENiwD'
 * are written verbatim through `EPDFAnnot_SetName`.
 */
export const STANDARD_STAMP_NAMES: ReadonlySet<string> = new Set([
  'Approved',
  'Experimental',
  'NotApproved',
  'AsIs',
  'Expired',
  'NotForPublicRelease',
  'Confidential',
  'Final',
  'Sold',
  'Departmental',
  'ForComment',
  'TopSecret',
  'Draft',
  'ForPublicRelease',
  'Completed',
  'Void',
  'PreliminaryResults',
  'InformationOnly',
  'Rejected',
  'Witness',
  'InitialHere',
  'SignHere',
  'Accepted',
]);

export function isStandardStampName(name: string): boolean {
  return STANDARD_STAMP_NAMES.has(name);
}
