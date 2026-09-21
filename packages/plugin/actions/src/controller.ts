/**
 * The actions controller: the composition root. It builds the plugin's
 * services once, wires each area with the services it declares, and
 * assembles the host capability from the areas' API slices. No behavior
 * lives here — every verb and read has a home in `submit/`, `scripting/`,
 * `dispatch/` or `lifecycle/`.
 */
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

/** Every API member is defined by exactly one area — a duplicate is a wiring bug. */
function assertDisjoint(slices: readonly object[]): void {
  const seen = new Set<string>();
  for (const slice of slices) {
    for (const key of Object.keys(slice)) {
      if (seen.has(key)) throw new Error(`[actions] api member '${key}' is defined twice`);
      seen.add(key);
    }
  }
}

export function createActionsController(
  ctx: ActionsContext,
  config: ActionsConfig = {},
): ActionsHostCapability {
  const services = createServices(ctx, config);
  const { events, policy, ports } = services;

  // The lifecycle areas dispatch and run trees through the dispatcher that
  // is assembled last — bound late, explicitly (see `dispatch/core.ts`).
  const core: DispatchCore = {
    dispatch: (trigger) => dispatcher.dispatch(trigger),
    runAndEmit: (tree, actionCtx) => dispatcher.runAndEmit(tree, actionCtx),
  };

  const submit = createSubmit(ctx, services, config);
  const realm = createRealm(ctx, services, config);
  const surface = createScriptSurface(services, submit);
  const pageLifecycle = createPageLifecycle(ctx, services, config, core);
  const openSequence = createOpenSequence(ctx, services, config, pageLifecycle, core);
  const documentEvents = createDocumentEvents(ctx, services, config, openSequence, core);
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
  openSequence.arm();

  const slices = [
    policy.api,
    ports.api,
    realm.api,
    surface.api,
    pageLifecycle.api,
    openSequence.api,
    documentEvents.api,
    dispatcher.api,
  ] as const;
  assertDisjoint(slices);

  const api = {
    ...policy.api,
    ...ports.api,
    ...realm.api,
    ...surface.api,
    ...pageLifecycle.api,
    ...openSequence.api,
    ...documentEvents.api,
    ...dispatcher.api,
    // The observability hooks are services, not areas.
    onExecuted: events.actionHook.on,
    onDiagnostic: events.diagnosticHook.on,
    onScriptDiagnostic: events.scriptDiagnosticHook.on,
    onScriptError: events.scriptErrorHook.on,
    onOpenSequenceCompleted: events.openSequenceHook.on,
  } satisfies ActionsHostCapability;
  return api;
}
