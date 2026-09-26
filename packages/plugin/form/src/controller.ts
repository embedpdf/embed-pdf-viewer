/**
 * The form controller: the composition root. It builds the plugin's services
 * once, wires each area with the services it declares, and assembles the
 * host capability from the areas' API slices. No behavior lives here: every
 * verb and read has a home in `read/`, `write/` or `sync/`.
 */
import { composeApi } from '@embedpdf/core';

import { connectForm } from './connect';
import type { FormConfig } from './contract';
import type { FormHostCapability } from './host-contract';
import { createFieldReads } from './read/fields';
import { createWidgetReads } from './read/widgets';
import { createServices, type FormContext } from './services';
import { createActivation } from './write/activation';
import { createFieldWrites } from './write/fields';
import { createInterchange } from './write/interchange';
import { createResetWrites } from './write/reset';
import { createScriptEffects } from './write/script-effects';
import { createValueWrites } from './write/values';

export function createFormController(ctx: FormContext, config: FormConfig = {}) {
  const services = createServices(ctx, config);
  const { events, authority } = services;

  const fields = createFieldReads(services);
  const widgets = createWidgetReads(ctx, services);

  const values = createValueWrites(ctx, services);
  const resets = createResetWrites(ctx, services);
  const design = createFieldWrites(ctx, services, widgets);
  const interchange = createInterchange(ctx, services);
  const activation = createActivation(ctx, services);
  const scripts = createScriptEffects(ctx);

  const api: FormHostCapability = composeApi('form', [
    fields.api,
    widgets.api,
    values.api,
    resets.api,
    design.api,
    interchange.api,
    activation.api,
    scripts.api,
    {
      canRead: () => authority.can('doc.forms.read'),
      canFill: () => authority.can('doc.forms.fill'),
      canDesign: () => authority.can('doc.forms.modify'),
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
