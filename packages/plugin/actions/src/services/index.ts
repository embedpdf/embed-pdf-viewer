/**
 * Plugin-private services every area is built on: the events, the live
 * policy, the registration ports, the serial queue, the catalog read, session
 * authority and the print latch.
 */
import type { PluginContext } from '@embedpdf/core';

import type { ActionsConfig } from '../contract';
import { createAuthority } from './authority';
import { createCatalog, type ActionsCatalog } from './catalog';
import { createEvents, type ActionsEvents } from './events';
import { createPolicy, type ActionsPolicy } from './policy';
import { createPorts } from './ports';
import { createPrintLatch, type PrintLatch } from './print-latch';
import { createQueue, type ActionsQueue } from './queue';

export interface ActionsServices {
  readonly events: ActionsEvents;
  readonly policy: ActionsPolicy;
  readonly ports: ReturnType<typeof createPorts>;
  readonly queue: ActionsQueue;
  readonly catalog: ActionsCatalog;
  readonly authority: ReturnType<typeof createAuthority>;
  readonly printLatch: PrintLatch;
}

export function createServices(
  ctx: PluginContext<void>,
  config: ActionsConfig,
): ActionsServices {
  const events = createEvents(ctx);
  return {
    events,
    policy: createPolicy(ctx, config),
    ports: createPorts(events),
    queue: createQueue(ctx),
    catalog: createCatalog(ctx),
    authority: createAuthority(ctx),
    printLatch: createPrintLatch(),
  };
}
