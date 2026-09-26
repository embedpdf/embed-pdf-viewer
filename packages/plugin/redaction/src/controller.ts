/**
 * The redaction controller: the composition root. It builds the plugin's
 * services once, wires each area with the services it declares, and
 * assembles the capability from the areas' API slices. No behavior lives
 * here: every verb and read has a home in `read/`, `write/` or `sync/`.
 */
import { composeApi } from '@embedpdf/core';

import type { RedactionCapability, RedactionConfig } from './contract';
import { createPendingReads } from './read/pending';
import { createServices, type RedactionContext } from './services';
import { subscribeChanges } from './sync/document-events';
import { createApplying } from './write/apply';
import { createMarking } from './write/marks';

export function createRedactionController(ctx: RedactionContext, config: RedactionConfig = {}) {
  const services = createServices(ctx);
  const { events, store, siblings } = services;

  const pending = createPendingReads(services);
  const marking = createMarking(ctx, services, config, pending);
  const applying = createApplying(ctx, services, pending);

  const api: RedactionCapability = composeApi('redaction', [
    pending.api,
    marking.api,
    applying.api,
    {
      // Marks are annotations, so marking authority is annotation create
      // authority: the annotation plugin's own twin, not a re-derivation.
      canMark: () => siblings.annotation.canCreate(),
      canApply: store.canApply,
      isApplying: () => ctx.state.get().applying,
      getLastResult: () => ctx.state.get().lastResult,
      onApplied: events.applied.on,
      onPendingChanged: events.pendingChanged.on,
    },
  ]);

  return {
    api,
    connect() {
      subscribeChanges(ctx, services);
    },
  };
}
