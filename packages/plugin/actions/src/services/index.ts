/**
 * Plugin-private services every area is built on: the settings, the events,
 * the policy decision, the registration ports, the serial queue, the catalog
 * read, the form, session authority, the kernel's print and the print latch.
 */
import type { Settings } from '@embedpdf/core';

import type { ActionsSettings } from '../contract';
import { createAuthority } from './authority';
import { createCatalog, type ActionsCatalog } from './catalog';
import type { ActionsContext } from './context';
import { createDocumentPrint } from './document-print';
import { createEvents, type ActionsEvents } from './events';
import { createForm, type ActionsForm } from './form';
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
  /** The form scripts and dispatch read: the form plugin's view, else the engine's. */
  readonly form: ActionsForm;
  readonly authority: ReturnType<typeof createAuthority>;
  /** The kernel's print, when the host gave it a printer. */
  readonly documentPrint: ReturnType<typeof createDocumentPrint>;
  readonly printLatch: PrintLatch;
}

export function createServices(ctx: ActionsContext): ActionsServices {
  const events = createEvents(ctx);
  const ports = createPorts(events);
  return {
    settings: ctx.settings(),
    events,
    policy: createPolicy(ctx),
    ports,
    queue: createQueue(ctx),
    catalog: createCatalog(ctx),
    form: createForm(ctx, ports.slots),
    authority: createAuthority(ctx),
    documentPrint: createDocumentPrint(ctx),
    printLatch: createPrintLatch(),
  };
}
