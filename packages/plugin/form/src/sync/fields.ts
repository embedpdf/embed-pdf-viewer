/**
 * The field tree, mirrored from the engine. It changes only by loads and by
 * confirmed form events, whoever caused them: the plugin's own writes, the
 * document's scripts, or another session. This is also the one place the
 * value and field events fire.
 */
import { originOf, type Mirror } from '@embedpdf/core';

import {
  emptyFieldIndex,
  fieldsWithChangedValues,
  foldFormEvent,
  indexFields,
  type FieldIndex,
} from '../model';
import type { FormAuthority } from '../services/authority';
import type { FormContext } from '../services/context';
import type { FormEvents } from '../services/events';

export function createFieldsMirror(
  ctx: FormContext,
  events: FormEvents,
  authority: FormAuthority,
): Mirror<FieldIndex> {
  return ctx.mirror<FieldIndex>({
    name: 'fields',
    initial: emptyFieldIndex,
    // A reviewer-shaped token without `doc.forms.read` is a common narrowed
    // scope: skip the doomed read and report `forbidden`.
    readable: () => authority.can('doc.forms.read'),
    load: async (doc) => ({ value: indexFields(await doc.forms.list()) }),
    fold: foldFormEvent,
    changed: ({ cause, event, previous, next }) => {
      if (cause === 'load') {
        if (next.snapshot) events.resynced.emit({ snapshot: next.snapshot });
        return;
      }
      if (!event || !('origin' in event)) return;
      const origin = originOf(event);
      switch (event.type) {
        case 'form.valueChanged':
          events.valueChanged.emit({ ref: event.field.ref, field: event.field, origin });
          return;
        case 'form.fieldCreated':
          events.fieldCreated.emit({ ref: event.field.ref, field: event.field, origin });
          return;
        case 'form.fieldUpdated':
        case 'form.widgetAttached':
        case 'form.widgetDetached':
          events.fieldUpdated.emit({ ref: event.field.ref, field: event.field, origin });
          return;
        case 'form.fieldDeleted':
          events.fieldDeleted.emit({
            ref: { kind: 'objectNumber', fieldObjectNumber: event.deletedFieldObjectNumber },
            field: null,
            origin,
          });
          return;
        case 'form.effectsApplied':
        case 'form.imported':
          for (const field of fieldsWithChangedValues(previous, next)) {
            events.valueChanged.emit({ ref: field.ref, field, origin });
          }
          return;
        default:
          return;
      }
    },
  });
}
