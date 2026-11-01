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
import { createCursor, type FormCursor } from './cursor';
import { createDesign, type FormDesign } from './design';
import { createEvents, type FormEvents } from './events';
import { createFillRights, type FillRights } from './fill-rights';
import { createFormattedTexts, type FormattedTexts } from './formatted';
import { createWidgetLooks, type WidgetLooks } from './looks';
import { createWidgetPictures, type WidgetPictures } from './pictures';
import { createScriptingSeam, type FormScripting } from './scripting';
import { resolveSiblings, type FormSiblings } from './siblings';

export type { FormContext } from './context';

export interface FormServices {
  readonly fields: Mirror<FieldIndex>;
  /** Who may fill in which field. */
  readonly rights: FillRights;
  readonly events: FormEvents;
  /** Where the cursor is among the fields, and the controls it can go into. */
  readonly cursor: FormCursor;
  readonly siblings: FormSiblings;
  readonly scripting: FormScripting;
  /** Whether the widgets are lent to the annotation plugin now (design mode). */
  readonly design: FormDesign;
  /** The texts this session's format scripts wrote, for the painter. */
  readonly formatted: FormattedTexts;
  /** The engine's pictures of each page's widgets, at their picture versions. */
  readonly pictures: WidgetPictures;
  /** What each widget looks like now: pending or confirmed, and the painter's drawing of it. */
  readonly looks: WidgetLooks;
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
  const design = createDesign(ctx, siblings);
  const formatted = createFormattedTexts(ctx, fields);
  return {
    fields,
    rights: createFillRights(ctx, fields),
    events,
    cursor: createCursor(ctx, fields, events),
    siblings,
    scripting: createScriptingSeam(ctx, siblings),
    design,
    formatted,
    pictures: createWidgetPictures(fields, siblings),
    looks: createWidgetLooks({ fields, formatted, design }),
    enqueue: ctx.serialQueue('writes'),
    keyOf: (ref) => canonicalKey(fields.view(), ref),
  };
}
