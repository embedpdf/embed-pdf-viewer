/**
 * Confirmed document facts: announce, then reconcile. Own, script and remote
 * writes all surface through the document event stream, so every consumer
 * sees one publication path.
 */
import { originOf, type ChangeOrigin, type DocumentEvent } from '@embedpdf/core';

import type { FormContext, FormServices } from '../services';
import type { FormHydration } from './hydration';

export function subscribeDocumentEvents(
  ctx: FormContext,
  { store, events }: Pick<FormServices, 'store' | 'events'>,
  hydration: FormHydration,
): void {
  const { clearGeom } = store;
  const { valueChanged, fieldCreated, fieldUpdated, fieldDeleted } = events;
  const { refresh } = hydration;
  const STRUCTURAL = new Set<DocumentEvent['type']>([
    'form.fieldCreated',
    'form.fieldUpdated',
    'form.fieldDeleted',
    'form.widgetAttached',
    'form.widgetDetached',
    'form.repaired',
  ]);
  const announce = (event: DocumentEvent): void => {
    if (!('origin' in event)) return;
    const origin: ChangeOrigin = originOf(event);
    switch (event.type) {
      case 'form.valueChanged':
        valueChanged.emit({ ref: event.field.ref, field: event.field, origin });
        break;
      case 'form.fieldCreated':
        fieldCreated.emit({ ref: event.field.ref, field: event.field, origin });
        break;
      case 'form.fieldUpdated':
      case 'form.widgetAttached':
      case 'form.widgetDetached':
        fieldUpdated.emit({ ref: event.field.ref, field: event.field, origin });
        break;
      case 'form.fieldDeleted':
        fieldDeleted.emit({
          ref: { kind: 'objectNumber', fieldObjectNumber: event.deletedFieldObjectNumber },
          field: null,
          origin,
        });
        break;
      default:
        break;
    }
  };
  const onDocumentEvent = (event: DocumentEvent): void => {
    announce(event);
    if (event.type === 'stream.desynced') {
      void refresh();
      return;
    }
    if (event.type === 'document.versioned' || event.type === 'signature.completed') {
      void refresh();
      return;
    }
    if (!event.type.startsWith('form.') || !('origin' in event)) return;
    const structural = STRUCTURAL.has(event.type);
    if (event.origin.kind !== 'remote' && !structural) return; // own writes refreshed already
    if (structural) clearGeom();
    void refresh();
  };
  const off = ctx.doc?.events?.subscribe(onDocumentEvent);
  if (off) ctx.cleanup(off);
}
