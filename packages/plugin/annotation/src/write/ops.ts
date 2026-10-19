/**
 * The op builders: how the core's effects become the engine's ops. Each is a
 * pure function of an effect and the model the message left (its new
 * records included; a deleted one is in the model before it); the store
 * stages a message's ops as one change (services/store.ts).
 *
 * The text builder lives with text editing, the link builder with links, and
 * the capture handler with creation drafts.
 */
import { refOf } from '@embedpdf/core-annotation';

import type { AnnotationServices } from '../services';

export function registerOpBuilders({ store }: Pick<AnnotationServices, 'store'>): void {
  // A drawn record: written from the draft its annotation was read from, under its number.
  store.onEffect('create', (effect, model) => {
    const ref = refOf(model.byId[effect.id]);
    if (ref?.kind !== 'objectNumber') return;
    return [
      {
        type: 'annotations.create',
        page: ref.page,
        data: effect.draft,
        objectNumber: ref.objectNumber,
      },
    ];
  });

  // What a record's change means to the engine, as the core worked it out.
  // (Its attached link children follow it: write/links.ts.)
  store.onEffect('patch', (effect, model) => {
    const ref = refOf(model.byId[effect.id]);
    return ref ? [{ type: 'annotations.update', ref, patch: effect.patch }] : undefined;
  });

  // The record is gone from the model the message left: its ref is the one it had.
  store.onEffect('delete', (effect, _model, before) => {
    const ref = refOf(before.byId[effect.id]);
    return ref ? [{ type: 'annotations.delete', ref }] : undefined;
  });
}
