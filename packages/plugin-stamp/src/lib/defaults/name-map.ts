import { PdfAnnotationName } from '@embedpdf/models';

const ANNOTATION_NAME_MAP: Record<string, PdfAnnotationName> = {
  Approved: PdfAnnotationName.Approved,
  Experimental: PdfAnnotationName.Experimental,
  NotApproved: PdfAnnotationName.NotApproved,
  AsIs: PdfAnnotationName.AsIs,
  Expired: PdfAnnotationName.Expired,
  NotForPublicRelease: PdfAnnotationName.NotForPublicRelease,
  Confidential: PdfAnnotationName.Confidential,
  Final: PdfAnnotationName.Final,
  Sold: PdfAnnotationName.Sold,
  Departmental: PdfAnnotationName.Departmental,
  ForComment: PdfAnnotationName.ForComment,
  TopSecret: PdfAnnotationName.TopSecret,
  Draft: PdfAnnotationName.Draft,
  ForPublicRelease: PdfAnnotationName.ForPublicRelease,
  Completed: PdfAnnotationName.Completed,
  Void: PdfAnnotationName.Void,
  PreliminaryResults: PdfAnnotationName.PreliminaryResults,
  InformationOnly: PdfAnnotationName.InformationOnly,
  Rejected: PdfAnnotationName.Rejected,
  Witness: PdfAnnotationName.Witness,
  InitialHere: PdfAnnotationName.InitialHere,
  SignHere: PdfAnnotationName.SignHere,
  Accepted: PdfAnnotationName.Accepted,
  Custom: PdfAnnotationName.Custom,
  Image: PdfAnnotationName.Image,
};

export function parseAnnotationName(name?: string): PdfAnnotationName {
  if (!name) return PdfAnnotationName.Custom;
  return ANNOTATION_NAME_MAP[name] ?? PdfAnnotationName.Custom;
}
