/**
 * Plugin-private services every area is built on (NOT the kernel): the
 * store, the event hooks, authority, the sibling planes, the scripting seam
 * and the one serial mutation queue.
 */
import type { FormConfig } from '../contract';
import { createSerialMutationQueue } from '../mutationQueue';
import { createAuthority, type FormAuthority } from './authority';
import type { FormContext } from './context';
import { createEvents, type FormEvents } from './events';
import { createScriptingSeam, type FormScripting } from './scripting';
import { resolveSiblings, type FormSiblings } from './siblings';
import { createStore, type FormStore } from './store';

export type { FormContext } from './context';

export interface FormServices {
  readonly store: FormStore;
  readonly events: FormEvents;
  readonly authority: FormAuthority;
  readonly siblings: FormSiblings;
  readonly scripting: FormScripting;
  /** Every durable write rides ONE serial queue — an actions-driven form
   *  mutation never interleaves with a user's in-flight commit. */
  readonly enqueue: ReturnType<typeof createSerialMutationQueue>;
}

export function createServices(ctx: FormContext, config: FormConfig): FormServices {
  const siblings = resolveSiblings(ctx);
  return {
    store: createStore(ctx),
    events: createEvents(ctx),
    authority: createAuthority(ctx),
    siblings,
    scripting: createScriptingSeam(ctx, config, siblings),
    enqueue: createSerialMutationQueue(),
  };
}
