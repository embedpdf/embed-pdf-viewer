/**
 * Plugin-private services every area is built on: the two mirrors (the field
 * tree and per-page widget geometry), the events, the sibling plugins, the
 * scripting seam, and the one write queue. Session authority is the
 * context's (`ctx.allows`, `ctx.assertAllowed`).
 */
import type { Mirror, PageMirror, SerialQueue } from '@embedpdf/core';

import type { FormConfig } from '../contract';
import { fieldKeyOfRef, type FieldIndex, type WidgetBoxes } from '../model';
import { createFieldsMirror } from '../sync/fields';
import { createWidgetBoxesMirror } from '../sync/widget-boxes';
import type { FormContext } from './context';
import { createEvents, type FormEvents } from './events';
import { createScriptingSeam, type FormScripting } from './scripting';
import { resolveSiblings, type FormSiblings } from './siblings';

export type { FormContext } from './context';

export interface FormServices {
  readonly fields: Mirror<FieldIndex>;
  readonly widgetBoxes: PageMirror<WidgetBoxes>;
  readonly events: FormEvents;
  readonly siblings: FormSiblings;
  readonly scripting: FormScripting;
  /**
   * Every durable write rides one serial queue, so a write driven by the
   * actions plugin never interleaves with a user's in-flight commit.
   */
  readonly enqueue: SerialQueue;
  readonly keyOf: typeof fieldKeyOfRef;
}

export function createServices(ctx: FormContext, config: FormConfig): FormServices {
  const siblings = resolveSiblings(ctx);
  const events = createEvents(ctx);
  return {
    fields: createFieldsMirror(ctx, events),
    widgetBoxes: createWidgetBoxesMirror(ctx),
    events,
    siblings,
    scripting: createScriptingSeam(ctx, config, siblings),
    enqueue: ctx.serialQueue('writes'),
    keyOf: fieldKeyOfRef,
  };
}
