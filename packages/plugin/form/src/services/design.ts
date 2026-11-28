/**
 * What the form layer does now, by the active tool (`FormLayerMode`), and whether the form's
 * widgets are lent to the annotation plugin (write/lending.ts). Design mode is the form's own
 * tools, the ones that carry `form-design` (`form-edit` and every field tool, and an app's tool
 * that carries it): while one is active, the session may design and the annotation plugin is
 * there, the annotation layer draws and edits the widgets, and the form layer leaves them out.
 * A tool that fills forms (`form-fill`: the pointer and pan tools) makes the layer's controls
 * take input. Under any other tool (a stamp, a pen, zoom) the controls show as they do while
 * filling but take no input and no pointer, so the tool works over them.
 */
import { InteractionToken } from '@embedpdf/plugin-interaction/contract/host';

import type { FormLayerMode } from '../host-contract';
import { FORM_DESIGN_TAG } from '../tools/definitions';
import type { FormContext } from './context';
import type { FormSiblings } from './siblings';

export interface FormDesign {
  /** The widgets are lent to the annotation plugin: design mode. */
  lending(): boolean;
  /** What the form layer does now. */
  mode(): FormLayerMode;
}

export function createDesign(ctx: FormContext, siblings: FormSiblings): FormDesign {
  const interaction = ctx.tryGet(InteractionToken);
  const lending = (): boolean =>
    siblings.annotation() !== null &&
    interaction !== null &&
    ctx.allows('doc.forms.modify') &&
    interaction.activeToolEnables(FORM_DESIGN_TAG);
  return {
    lending,
    mode: () =>
      lending()
        ? 'design'
        : (interaction?.activeToolEnables('form-fill') ?? true)
          ? 'fill'
          : 'show',
  };
}
