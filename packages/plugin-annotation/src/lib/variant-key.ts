import { PdfAnnotationSubtype, PdfAnnotationObject } from '@embedpdf/models';

export type VariantKey = string;

export const makeVariantKey = (
  subtype: PdfAnnotationSubtype,
  intent?: string | null | undefined,
): VariantKey => (intent ? `${subtype}#${intent}` : `${subtype}`);

export const parseVariantKey = (
  key: VariantKey,
): { subtype: PdfAnnotationSubtype; intent?: string } => {
  const [subStr, intent] = key.split('#');
  return { subtype: Number(subStr) as PdfAnnotationSubtype, intent };
};

export const variantKeyFromAnnotation = (a: PdfAnnotationObject): VariantKey =>
  makeVariantKey(a.type, a.intent);
