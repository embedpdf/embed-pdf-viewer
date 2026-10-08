/**
 * The field tree, mirrored from the engine. It changes only by loads and by
 * confirmed form events, whoever caused them: the plugin's own writes, the
 * document's scripts, or another session. This is also the one place the
 * value and field events fire.
 */
import type { Mirror } from '@embedpdf/core';

import {
  emptyFieldIndex,
  fieldsWithChangedValues,
  foldFormEvent,
  indexFields,
  type FieldIndex,
} from '../model';
import type { FormContext } from '../services/context';
import type { FormEvents } from '../services/events';

export function createFieldsMirror(ctx: FormContext, events: FormEvents): Mirror<FieldIndex> {
  return ctx.mirror<FieldIndex>({
    name: 'fields',
    initial: emptyFieldIndex,
    // A reviewer-shaped token without `doc.forms.read` is a common narrowed
    // scope: skip the doomed read and report `forbidden`.
    readable: () => ctx.allows('doc.forms.read'),
    load: async (doc) => ({ value: indexFields(await doc.forms.list()) }),
    fold: foldFormEvent,
    changed: ({ cause, event, previous, next }) => {
      if (cause === 'load') {
        if (next.snapshot) events.resynced.emit({ snapshot: next.snapshot });
        return;
      }
      if (!event || !('origin' in event)) return;
      const { origin } = event;
      switch (event.type) {
        case 'forms.valueSet':
          events.valueChanged.emit({ field: event.field, origin });
          return;
        case 'forms.created':
          events.fieldCreated.emit({ field: event.field, origin });
          return;
        case 'forms.updated':
        case 'forms.widgetAdded':
        case 'forms.widgetRemoved':
          events.fieldUpdated.emit({ field: event.field, origin });
          return;
        case 'forms.widgetDeleted':
        case 'forms.widgetRestored':
          if (event.field) events.fieldUpdated.emit({ field: event.field, origin });
          return;
        case 'forms.deleted':
          if (event.deleted) events.fieldDeleted.emit({ ref: event.deleted, origin });
          return;
        case 'forms.effectsApplied':
          for (const field of fieldsWithChangedValues(previous, next)) {
            events.valueChanged.emit({ field, origin });
          }
          return;
        default:
          return;
      }
    },
  });
}
