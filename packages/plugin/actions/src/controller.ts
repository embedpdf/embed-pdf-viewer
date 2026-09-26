/**
 * The actions controller: the composition root. It builds the plugin's
 * services once, wires each area with the services it declares, and
 * assembles the host capability from the areas' API slices. No behavior
 * lives here: every verb and read has a home in `submit/`, `scripting/`,
 * `dispatch/` or `lifecycle/`. The plugin keeps no session state; its live
 * data (policy, ports, queue, latches) are resources of the areas.
 */
import { composeApi, type PluginContext } from '@embedpdf/core';

import type { ActionsConfig } from './contract';
import type { DispatchCore } from './dispatch/core';
import { createDispatcher } from './dispatch/dispatcher';
import { createRunner } from './dispatch/run';
import { createTriggers } from './dispatch/triggers';
import type { ActionsHostCapability } from './host-contract';
import { createDocumentEvents } from './lifecycle/document-events';
import { createOpenSequence } from './lifecycle/open-sequence';
import { createPageLifecycle } from './lifecycle/page-lifecycle';
import { registerScriptExecutor } from './scripting/executor';
import { createRealm } from './scripting/realm';
import { createScriptSurface } from './scripting/surface';
import { createServices } from './services';
import { createSubmit } from './submit/perform';

export function createActionsController(ctx: PluginContext<void>, config: ActionsConfig = {}) {
  const services = createServices(ctx, config);
  const { events, policy, ports } = services;

  // The lifecycle areas dispatch and run trees through the dispatcher that
  // is assembled last, bound late and explicitly (see `dispatch/core.ts`).
  const core: DispatchCore = {
    dispatch: (trigger) => dispatcher.dispatch(trigger),
    runAndEmit: (tree, actionContext) => dispatcher.runAndEmit(tree, actionContext),
  };

  const submit = createSubmit(ctx, services, config);
  const realm = createRealm(ctx, services, config);
  const surface = createScriptSurface(services, submit);
  const pageLifecycle = createPageLifecycle(ctx, services, config, core);
  const openSequence = createOpenSequence(services, config, pageLifecycle, core);
  const documentEvents = createDocumentEvents(services, config, openSequence, core);
  const triggers = createTriggers(ctx, config);
  const runner = createRunner(ctx, services, submit, documentEvents);
  const dispatcher = createDispatcher(
    ctx,
    services,
    runner,
    triggers,
    openSequence,
    documentEvents,
  );
  registerScriptExecutor(ctx, services, config, realm, submit, surface, documentEvents);

  const api: ActionsHostCapability = composeApi('actions', [
    policy.api,
    ports.api,
    realm.api,
    surface.api,
    pageLifecycle.api,
    openSequence.api,
    documentEvents.api,
    dispatcher.api,
    {
      onExecuted: events.actionHook.on,
      onDiagnostic: events.diagnosticHook.on,
      onScriptDiagnostic: events.scriptDiagnosticHook.on,
      onScriptError: events.scriptErrorHook.on,
      onOpenSequenceCompleted: events.openSequenceHook.on,
    },
  ]);

  return {
    api,
    connect() {
      // Confirmed document events of every origin invalidate the per-page
      // lifecycle-annotation cache.
      ctx.listen(ctx.doc.events, (event) => triggers.invalidate(event));
      // Fires the open sequence at once for 'headless', releases the page
      // barrier for 'off', and waits for an adapter or user activity for 'auto'.
      openSequence.arm();
    },
  };
}
