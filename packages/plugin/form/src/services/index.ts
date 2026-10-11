/**
 * Plugin-private services every area is built on: the form's mirror (the
 * field tree and every widget row), who may fill in which field, the events,
 * the sibling plugins, the scripting seam, and the one write queue. The rest
 * of the session's authority is the context's (`ctx.allows`,
 * `ctx.assertAllowed`).
 */
import type { Mirror, SerialQueue } from '@embedpdf/core';
import type { FormFieldRef } from '@embedpdf/engine-core/runtime';

import { canonicalKey, type FieldIndex, type FieldKey } from '../model';
import { createFieldsMirror } from '../sync/fields';
import type { FormContext } from './context';
import { createDesign, type FormDesign } from './design';
import { createEvents, type FormEvents } from './events';
import { createFillRights, type FillRights } from './fill-rights';
import { createScriptingSeam, type FormScripting } from './scripting';
import { resolveSiblings, type FormSiblings } from './siblings';

export type { FormContext } from './context';

export interface FormServices {
  readonly fields: Mirror<FieldIndex>;
  /** Who may fill in which field. */
  readonly rights: FillRights;
  readonly events: FormEvents;
  readonly siblings: FormSiblings;
  readonly scripting: FormScripting;
  /** Whether the widgets are lent to the annotation plugin now (design mode). */
  readonly design: FormDesign;
  /**
   * Fills take turns on one serial queue until they are sent (write/fill.ts),
   * and a repair until the engine answers.
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
    rights: createFillRights(ctx, fields),
    events,
    siblings,
    scripting: createScriptingSeam(ctx, siblings),
    design: createDesign(ctx, siblings),
    enqueue: ctx.serialQueue('writes'),
    keyOf: (ref) => canonicalKey(fields.view(), ref),
  };
}
