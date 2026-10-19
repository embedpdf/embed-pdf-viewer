/**
 * Whether the form's widgets are lent to the annotation plugin now
 * (write/lending.ts): the session may design, the annotation plugin is there,
 * and the active tool doesn't fill. Then the annotation layer draws and edits
 * the widgets, and the form layer leaves them out.
 */
import { InteractionToken } from '@embedpdf/plugin-interaction/contract/host';

import type { FormContext } from './context';
import type { FormSiblings } from './siblings';

export interface FormDesign {
  lending(): boolean;
}

export function createDesign(ctx: FormContext, siblings: FormSiblings): FormDesign {
  const interaction = ctx.tryGet(InteractionToken);
  return {
    lending: () =>
      siblings.annotation() !== null &&
      interaction !== null &&
      ctx.allows('doc.forms.modify') &&
      !(interaction.getActiveTool()?.enables.has('form-fill') ?? false),
  };
}
