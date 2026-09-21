/**
 * Plugin-private services every area is built on (NOT the kernel): the
 * event hooks, the slice reads and engine doors, authority, the sibling
 * planes and mark resolution.
 */
import type { SignatureConfig } from '../contract';
import { createAuthority, type SignatureAuthority } from './authority';
import type { SignatureContext } from './context';
import { createEvents, type SignatureEvents } from './events';
import { createMarks, type SignatureMarks } from './marks';
import { resolveSiblings, type SignatureSiblings } from './siblings';
import { createStore, type SignatureStore } from './store';

export type { SignatureContext } from './context';

export interface SignatureServices {
  readonly events: SignatureEvents;
  readonly store: SignatureStore;
  readonly authority: SignatureAuthority;
  readonly siblings: SignatureSiblings;
  readonly marks: SignatureMarks;
}

export function createServices(ctx: SignatureContext, config: SignatureConfig): SignatureServices {
  const siblings = resolveSiblings(ctx);
  return {
    events: createEvents(ctx),
    store: createStore(ctx),
    authority: createAuthority(ctx, config),
    siblings,
    marks: createMarks(siblings),
  };
}
