/** The sibling planes: the form plugin (required), the stamp and annotation plugins (optional). */
import { AnnotationToken } from '@embedpdf/plugin-annotation/contract';
import { FormToken } from '@embedpdf/plugin-form/contract';
import { StampToken } from '@embedpdf/plugin-stamp/contract';

import type { SignatureContext } from './context';

export function resolveSiblings(ctx: SignatureContext) {
  return {
    form: ctx.get(FormToken),
    stamp: () => ctx.tryGet(StampToken),
    annotation: () => ctx.get(AnnotationToken),
  };
}
export type SignatureSiblings = ReturnType<typeof resolveSiblings>;
