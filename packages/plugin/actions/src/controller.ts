/**
 * The actions controller: the composition root. It builds the plugin's
 * services once, wires each area with the services it declares, and
 * assembles the host capability from the areas' API slices. No behavior
 * lives here: every verb and read has a home in `submit/`, `scripting/`,
 * `dispatch/` or `lifecycle/`. The plugin keeps no session state: its rules
 * are its settings, and its live data (ports, queue, latches) are resources
 * of the areas.
 */
import { composeApi } from '@embedpdf/core';

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
import { createServices, type ActionsContext } from './services';
import { createSubmit } from './submit/perform';

/**
 * `config` is what the app registered; the settings in it reach the
 * controller through `ctx.settings()`, and only the script environment is
 * read from it here.
 */
export function createActionsController(ctx: ActionsContext, config: ActionsConfig = {}) {
  const services = createServices(ctx);
  const { events, ports, settings } = services;

  // The lifecycle areas dispatch and run trees through the dispatcher that
  // is assembled last, bound late and explicitly (see `dispatch/core.ts`).
  const core: DispatchCore = {
    dispatch: (trigger) => dispatcher.dispatch(trigger),
    runAndEmit: (tree, actionContext) => dispatcher.runAndEmit(tree, actionContext),
  };

  const environment = config.javascript ?? {};
  const submit = createSubmit(ctx, services, environment);
  const realm = createRealm(ctx, services, environment);
  const surface = createScriptSurface(services, submit);
  const pageLifecycle = createPageLifecycle(ctx, services, core);
  const openSequence = createOpenSequence(services, pageLifecycle, core);
  const documentEvents = createDocumentEvents(services, openSequence, core);
  const triggers = createTriggers(ctx, services);
  const runner = createRunner(ctx, services, submit, documentEvents);
  const dispatcher = createDispatcher(
    ctx,
    services,
    runner,
    triggers,
    openSequence,
    documentEvents,
  );
  registerScriptExecutor(ctx, services, environment, realm, submit, surface, documentEvents);

  const api: ActionsHostCapability = composeApi('actions', [
    settings.api,
    ports.api,
    realm.api,
    surface.api,
    pageLifecycle.api,
    openSequence.api,
    documentEvents.api,
    dispatcher.api,
    {
      onExecuted: events.executed.on,
      onDiagnosticReported: events.diagnosticReported.on,
      onScriptDiagnosticReported: events.scriptDiagnosticReported.on,
      onScriptFailed: events.scriptFailed.on,
      onOpenSequenceCompleted: events.openSequenceCompleted.on,
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
      // The document's save actions (/WS, /DS) run around every download of its file, so
      // what WillSave changes is in the bytes.
      ctx.aroundDownload((read) => documentEvents.api.runDocumentVerb('save', read));
    },
  };
}
