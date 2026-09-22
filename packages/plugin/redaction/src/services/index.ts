/** Plugin-private services every area is built on (NOT the kernel). */
import type { RedactionContext } from './context';
import { createEvents, type RedactionEvents } from './events';
import { resolveSiblings, type RedactionSiblings } from './siblings';
import { createStore, type RedactionStore } from './store';

export type { RedactionContext } from './context';

export interface RedactionServices {
  readonly events: RedactionEvents;
  readonly store: RedactionStore;
  readonly siblings: RedactionSiblings;
}

export function createServices(ctx: RedactionContext): RedactionServices {
  return { events: createEvents(ctx), store: createStore(ctx), siblings: resolveSiblings(ctx) };
}
