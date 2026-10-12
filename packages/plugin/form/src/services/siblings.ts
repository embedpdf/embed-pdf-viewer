/** The optional sibling planes, resolved once at construction. A fill-only
 *  setup may have none; every area guards on null. */
import { ActionsToken as ActionsHostToken } from '@embedpdf/plugin-actions/contract/host';
import { AnnotationToken as AnnotationHostToken } from '@embedpdf/plugin-annotation/contract/host';
import { RenderToken as RenderHostToken } from '@embedpdf/plugin-render/contract/host';

import type { FormContext } from './context';

export function resolveSiblings(ctx: FormContext) {
  return {
    /** The annotation plugin: design mode's selection, tools, ghosts and placement previews. */
    annotation: ctx.tryGet(AnnotationHostToken),
    /** The script realm owner and the one surface port for script results. */
    actions: ctx.tryGet(ActionsHostToken),
    /** The page renderer: the widgets' pictures, shared by the form layer and design mode. */
    render: ctx.tryGet(RenderHostToken),
  };
}
export type FormSiblings = ReturnType<typeof resolveSiblings>;
