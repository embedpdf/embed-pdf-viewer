/** The optional sibling planes, resolved once at construction. A fill-only
 *  setup has neither; every area guards on null. */
import { ActionsToken as ActionsHostToken } from '@embedpdf/plugin-actions/contract/host';
import { AnnotationToken as AnnotationHostToken } from '@embedpdf/plugin-annotation/contract/host';

import type { FormContext } from './context';

export function resolveSiblings(ctx: FormContext) {
  return {
    /** The widget plane: geometry, live boxes, page reloads after structural writes. */
    annotation: ctx.tryGet(AnnotationHostToken),
    /** The script realm owner and the one surface port for script results. */
    actions: ctx.tryGet(ActionsHostToken),
  };
}
export type FormSiblings = ReturnType<typeof resolveSiblings>;
