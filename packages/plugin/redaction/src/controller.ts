/**
 * The redaction controller: the composition root. It builds the plugin's
 * services once, wires each area with the services it declares, and
 * assembles the capability from the areas' API slices. No behavior lives
 * here — every verb and read has a home in `read/`, `write/` or `sync/`.
 */
import type { RedactionConfig } from './contract';
import type { RedactionHostCapability } from './host-contract';
import { createPendingReads } from './read/pending';
import { createServices, type RedactionContext } from './services';
import { subscribeChanges } from './sync/document-events';
import { createApplying } from './write/apply';
import { createMarking } from './write/marks';

/** Every API member is defined by exactly one area — a duplicate is a wiring bug. */
function assertDisjoint(slices: readonly object[]): void {
  const seen = new Set<string>();
  for (const slice of slices) {
    for (const key of Object.keys(slice)) {
      if (seen.has(key)) throw new Error(`[redaction] api member '${key}' is defined twice`);
      seen.add(key);
    }
  }
}

export function createRedactionController(
  ctx: RedactionContext,
  config: RedactionConfig = {},
): { api: RedactionHostCapability; connect(): void } {
  const services = createServices(ctx);
  const { events, store, siblings } = services;

  const pending = createPendingReads(services);
  const marking = createMarking(ctx, services, config, pending);
  const applying = createApplying(ctx, services, pending);

  const slices = [pending.api, marking.api, applying.api] as const;
  assertDisjoint(slices);

  const api = {
    ...pending.api,
    ...marking.api,
    ...applying.api,
    // Marks are annotations — marking authority IS annotation create
    // authority (the annotation plugin's own twin, not a re-derivation).
    canMark: () => siblings.annotation.canCreate(),
    canApply: store.canApply,
    isApplying: () => store.state().applying,
    getLastResult: () => store.state().lastResult,
    onApplied: events.applied.on,
    onPendingChanged: events.pendingChanged.on,
  } satisfies RedactionHostCapability;

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
