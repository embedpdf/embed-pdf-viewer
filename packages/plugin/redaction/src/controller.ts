/**
 * The redaction controller: the composition root. It builds the plugin's
 * services once, wires each area with the services it declares, and
 * assembles the capability from the areas' API slices. No behavior lives
 * here — every verb and read has a home in `read/`, `write/` or `sync/`.
 */
import { composeApi } from '@embedpdf/core';
import type { RedactionConfig } from './contract';
import type { RedactionHostCapability } from './host-contract';
import { createPendingReads } from './read/pending';
import { createServices, type RedactionContext } from './services';
import { subscribeChanges } from './sync/document-events';
import { createApplying } from './write/apply';
import { createMarking } from './write/marks';

export function createRedactionController(
  ctx: RedactionContext,
  config: RedactionConfig = {},
): { api: RedactionHostCapability; connect(): void } {
  const services = createServices(ctx);
  const { events, store, siblings } = services;

  const pending = createPendingReads(services);
  const marking = createMarking(ctx, services, config, pending);
  const applying = createApplying(ctx, services, pending);

  const api = composeApi('redaction', [
    pending.api,
    marking.api,
    applying.api,
    {
      // Marks are annotations — marking authority IS annotation create
      // authority (the annotation plugin's own twin, not a re-derivation).
      canMark: () => siblings.annotation.canCreate(),
      canApply: store.canApply,
      isApplying: () => store.state().applying,
      getLastResult: () => store.state().lastResult,
      onApplied: events.applied.on,
      onPendingChanged: events.pendingChanged.on,
    },
  ]) satisfies RedactionHostCapability;

  return {
    api,
    connect() {
      subscribeChanges(ctx, services);
    },
  };
}

/** The capability alone, connected at once — the shape the unit tests build. */
export function createRedactionCapability(
  ctx: RedactionContext,
  config: RedactionConfig = {},
): RedactionHostCapability {
  const { api, connect } = createRedactionController(ctx, config);
  connect();
  return api;
}
