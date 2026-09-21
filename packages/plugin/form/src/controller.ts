/**
 * The form controller: the composition root. It builds the plugin's services
 * once, wires each area with the services it declares, and assembles the
 * host capability from the areas' API slices. No behavior lives here — every
 * verb and read has a home in `read/`, `write/` or `sync/`.
 */
import type { FormConfig } from './contract';
import type { FormHostCapability } from './host-contract';
import { createFieldReads } from './read/fields';
import { createWidgetReads } from './read/widgets';
import { createServices, type FormContext } from './services';
import { subscribeDocumentEvents } from './sync/document-events';
import { createHydration } from './sync/hydration';
import { createActivation } from './write/activation';
import { createFieldWrites } from './write/fields';
import { createInterchange } from './write/interchange';
import { createResetWrites } from './write/reset';
import { createScriptEffects } from './write/script-effects';
import { createValueWrites } from './write/values';

/** Every API member is defined by exactly one area — a duplicate is a wiring bug. */
function assertDisjoint(slices: readonly object[]): void {
  const seen = new Set<string>();
  for (const slice of slices) {
    for (const key of Object.keys(slice)) {
      if (seen.has(key)) throw new Error(`[form] api member '${key}' is defined twice`);
      seen.add(key);
    }
  }
}

/**
 * The model holds the reconciled field tree, the per-page widget geometry
 * and the in-flight writes; every engine read lands through hydration, every
 * confirmed field change is announced from the document event stream in
 * `connect` (own, script and remote writes alike).
 */
export function createFormController(
  ctx: FormContext,
  config: FormConfig = {},
): { api: FormHostCapability; connect(): void } {
  const services = createServices(ctx, config);
  const { events, authority } = services;

  // Reads: pure projections of the model.
  const fields = createFieldReads(services);
  const widgets = createWidgetReads(ctx, services);

  // Sync: the engine's field tree into the model.
  const hydration = createHydration(ctx, services);

  // Writes: every durable change, through the one serial queue.
  const values = createValueWrites(ctx, services, hydration);
  const resets = createResetWrites(ctx, services, hydration);
  const design = createFieldWrites(ctx, services, hydration, widgets);
  const interchange = createInterchange(ctx, services, hydration);
  const activation = createActivation(ctx, services, hydration, fields);
  const scripts = createScriptEffects(ctx, services, hydration);

  const slices = [
    fields.api,
    widgets.api,
    hydration.api,
    values.api,
    resets.api,
    design.api,
    interchange.api,
    activation.api,
    scripts.api,
  ] as const;
  assertDisjoint(slices);

  const api = {
    ...fields.api,
    ...widgets.api,
    ...hydration.api,
    ...values.api,
    ...resets.api,
    ...design.api,
    ...interchange.api,
    ...activation.api,
    ...scripts.api,
    // Authority twins and the confirmed-change events are services, not areas.
    canRead: () => authority.can('doc.forms.read'),
    canFill: () => authority.can('doc.forms.fill'),
    canDesign: () => authority.can('doc.forms.modify'),
    onValueChanged: events.valueChanged.on,
    onFieldCreated: events.fieldCreated.on,
    onFieldUpdated: events.fieldUpdated.on,
    onFieldDeleted: events.fieldDeleted.on,
    onValidationRejected: events.validationRejected.on,
    onResynced: events.resynced.on,
  } satisfies FormHostCapability;

  return {
    api,
    connect() {
      subscribeDocumentEvents(ctx, services, hydration);
      void hydration.refresh();
    },
  };
}

/** The capability alone, connected at once — the shape the unit tests build. */
export function createFormCapability(
  ctx: FormContext,
  config: FormConfig = {},
): FormHostCapability {
  const { api, connect } = createFormController(ctx, config);
  connect();
  return api;
}
