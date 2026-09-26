/**
 * Plugin-private services every area is built on: the two mirrors (the field
 * tree and per-page widget geometry), the events, authority, the sibling
 * plugins, the scripting seam, and the one write queue.
 */
import type { Mirror, PageMirror } from '@embedpdf/core';

import type { FormConfig } from '../contract';
import { fieldKeyOfRef, type FieldIndex, type WidgetBoxes } from '../model';
import { createFieldsMirror } from '../sync/fields';
import { createWidgetBoxesMirror } from '../sync/widget-boxes';
import { createAuthority, type FormAuthority } from './authority';
import type { FormContext } from './context';
import { createEvents, type FormEvents } from './events';
import { createScriptingSeam, type FormScripting } from './scripting';
import { resolveSiblings, type FormSiblings } from './siblings';

export type { FormContext } from './context';

export interface FormServices {
  readonly fields: Mirror<FieldIndex>;
  readonly widgetBoxes: PageMirror<WidgetBoxes>;
  readonly events: FormEvents;
  readonly authority: FormAuthority;
  readonly siblings: FormSiblings;
  readonly scripting: FormScripting;
  /**
   * Every durable write rides one serial queue, so a write driven by the
   * actions plugin never interleaves with a user's in-flight commit.
   */
  readonly enqueue: <T>(operation: () => Promise<T>) => Promise<T>;
  readonly keyOf: typeof fieldKeyOfRef;
}

export function createServices(ctx: FormContext, config: FormConfig): FormServices {
  const siblings = resolveSiblings(ctx);
  const events = createEvents(ctx);
  const authority = createAuthority(ctx);
  return {
    fields: createFieldsMirror(ctx, events, authority),
    widgetBoxes: createWidgetBoxesMirror(ctx),
    events,
    authority,
    siblings,
    scripting: createScriptingSeam(ctx, config, siblings),
    enqueue: ctx.serialQueue('writes'),
    keyOf: fieldKeyOfRef,
  };
}
