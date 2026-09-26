import type { BlendMode } from '@embedpdf/engine-core/runtime';
import type { PdfFunctions, Ptr } from '@embedpdf/engine-runtime';

import { blendModeToCode } from '../blendMode';

/**
 * Bake an annotation's `/AP` normal appearance from its dictionary with
 * PDFium's generator. Only the annotation and the document are touched, so
 * a raw handle serves. `false` for a kind with no generator (widgets): the
 * annotation ships without one and viewers draw it themselves.
 */
export function generateAppearance(
  fn: PdfFunctions,
  annotPtr: Ptr,
  blendMode?: BlendMode,
): boolean {
  return blendMode === undefined
    ? fn.EPDFAnnot_GenerateAppearance(annotPtr)
    : fn.EPDFAnnot_GenerateAppearanceWithBlend(annotPtr, blendModeToCode(blendMode));
}
