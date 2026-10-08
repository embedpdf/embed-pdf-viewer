/**
 * Plugin-private services every area is built on: the form's mirror (the
 * field tree and every widget row), the events, the sibling plugins, the
 * scripting seam, and the one write queue. Session authority is the
 * context's (`ctx.allows`, `ctx.assertAllowed`).
 */
import type { Mirror, SerialQueue } from '@embedpdf/core';
import type { FormFieldRef } from '@embedpdf/engine-core/runtime';

import { canonicalKey, type FieldIndex, type FieldKey } from '../model';
import { createFieldsMirror } from '../sync/fields';
import type { FormContext } from './context';
import { createEvents, type FormEvents } from './events';
import { createScriptingSeam, type FormScripting } from './scripting';
import { resolveSiblings, type FormSiblings } from './siblings';

export type { FormContext } from './context';

export interface FormServices {
  readonly fields: Mirror<FieldIndex>;
  readonly events: FormEvents;
  readonly siblings: FormSiblings;
  readonly scripting: FormScripting;
  /**
   * Every durable write rides one serial queue, so a write driven by the
   * actions plugin never interleaves with a user's in-flight commit.
   */
  readonly enqueue: SerialQueue;
  /** The key a field is known by, whichever ref names it (`toFieldRef(name)` too). */
  readonly keyOf: (ref: FormFieldRef) => FieldKey;
}

export function createServices(ctx: FormContext): FormServices {
  const siblings = resolveSiblings(ctx);
  const events = createEvents(ctx);
  const fields = createFieldsMirror(ctx, events);
  return {
    fields,
    events,
    siblings,
    scripting: createScriptingSeam(ctx, siblings),
    enqueue: ctx.serialQueue('writes'),
    keyOf: (ref) => canonicalKey(fields.get(), ref),
  };
}
