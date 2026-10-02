/**
 * The form controller: the composition root. It builds the plugin's services
 * once, wires each area with the services it declares, and assembles the
 * host capability from the areas' API slices. No behavior lives here: every
 * verb and read has a home in `read/`, `write/` or `sync/`.
 */
import { composeApi } from '@embedpdf/core';

import { connectForm } from './connect';
import type { FormHostCapability } from './host-contract';
import { createFieldReads } from './read/fields';
import { createWidgetReads } from './read/widgets';
import { createServices, type FormContext } from './services';
import { createActivation } from './write/activation';
import { createFieldWrites } from './write/fields';
import { createInterchange } from './write/interchange';
import { createResetWrites } from './write/reset';
import { createScriptEffects } from './write/script-effects';
import { createTyping } from './write/typing';
import { createValueWrites } from './write/values';

export function createFormController(ctx: FormContext) {
  const services = createServices(ctx);
  const { events } = services;
  const settings = ctx.settings();

  const fields = createFieldReads(ctx, services);
  const widgets = createWidgetReads(ctx, services);

  const values = createValueWrites(ctx, services);
  const typing = createTyping(ctx, services, values.setText);
  const resets = createResetWrites(ctx, services);
  const design = createFieldWrites(ctx, services);
  const interchange = createInterchange(ctx, services);
  const activation = createActivation(ctx, services);
  const scripts = createScriptEffects(ctx);

  const api: FormHostCapability = composeApi('form', [
    settings.api,
    fields.api,
    widgets.api,
    values.api,
    typing.api,
    resets.api,
    design.api,
    interchange.api,
    activation.api,
    scripts.api,
    {
      canRead: () => ctx.allows('doc.forms.read'),
      canFill: () => ctx.allows('doc.forms.fill'),
      canDesign: () => ctx.allows('doc.forms.modify'),
      onValueChanged: events.valueChanged.on,
      onFieldCreated: events.fieldCreated.on,
      onFieldUpdated: events.fieldUpdated.on,
      onFieldDeleted: events.fieldDeleted.on,
      onValidationRejected: events.validationRejected.on,
      onResynced: events.resynced.on,
    },
  ]);

  return {
    api,
    connect: () => connectForm(ctx, api),
  };
}
