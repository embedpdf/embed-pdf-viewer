import { PdfAnnotationSubtypeCode, type AnnotationFamily } from '@embedpdf/engine-core/runtime';

/** The family of an annotation with subtype code `subtypeCode`: `familyOfSubtype`, by code. */
export function familyOfCode(subtypeCode: number): AnnotationFamily {
  return subtypeCode === PdfAnnotationSubtypeCode.WIDGET ? 'widgets' : 'annotations';
}
