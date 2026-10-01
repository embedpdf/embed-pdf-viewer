/**
 * Plugin-private services every area is built on: the settings, the events,
 * the policy decision, the registration ports, the serial queue, the catalog
 * read, session authority and the print latch.
 */
import type { Settings } from '@embedpdf/core';

import type { ActionsSettings } from '../contract';
import { createAuthority } from './authority';
import { createCatalog, type ActionsCatalog } from './catalog';
import type { ActionsContext } from './context';
import { createEvents, type ActionsEvents } from './events';
import { createPolicy, type ActionsPolicy } from './policy';
import { createPorts } from './ports';
import { createPrintLatch, type PrintLatch } from './print-latch';
import { createQueue, type ActionsQueue } from './queue';

export type { ActionsContext } from './context';

export interface ActionsServices {
  /** The plugin's settings: read `get()` where a setting is used, so a change applies at once. */
  readonly settings: Settings<ActionsSettings>;
  readonly events: ActionsEvents;
  readonly policy: ActionsPolicy;
  readonly ports: ReturnType<typeof createPorts>;
  readonly queue: ActionsQueue;
  readonly catalog: ActionsCatalog;
  readonly authority: ReturnType<typeof createAuthority>;
  readonly printLatch: PrintLatch;
}

export function createServices(ctx: ActionsContext): ActionsServices {
  const events = createEvents(ctx);
  return {
    settings: ctx.settings(),
    events,
    policy: createPolicy(ctx),
    ports: createPorts(events),
    queue: createQueue(ctx),
    catalog: createCatalog(ctx),
    authority: createAuthority(ctx),
    printLatch: createPrintLatch(),
  };
}
