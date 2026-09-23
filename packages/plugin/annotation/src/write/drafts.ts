import {
  creationDraftAnchor,
  type CreationDraftAnchor,
  type Model,
  type Point,
} from '@embedpdf/core-annotation';
import { pageSpace } from '@embedpdf/core-geometry';

import type { AnnotationServices } from '../services';
import { createdRefOf } from './outcomes';

/**
 * Creation drafts: the live multi-click or buffered-ink draft a gesture
 * builds, its commit and cancel doors, and the captured-draft seam the
 * measurement plugin calibrates from.
 */
export function createDrafts({
  store,
  geometry,
  events,
}: Pick<AnnotationServices, 'store' | 'geometry' | 'events'>) {
  let anchorCache: { model: Model; v: CreationDraftAnchor | null } | null = null;
  const draftAnchorOf = (): CreationDraftAnchor | null => {
    const model = store.model();
    if (anchorCache && anchorCache.model === model) return anchorCache.v;
    const anchor = creationDraftAnchor(model);
    anchorCache = { model: model, v: anchor };
    return anchor;
  };

  // A capture-only tool (the measurement calibration line) reports its draft
  // in PDF user space instead of creating anything.
  store.onEffect('captured', (effect) => {
    const crop = geometry.cropOf(effect.page.pageObjectNumber);
    if (crop && effect.geometry.kind === 'line') {
      const pdf = (point: Point) => pageSpace(crop).pageToPdf(point);
      events.draftCaptured.emit({
        tool: effect.tool,
        page: effect.page,
        from: pdf(effect.geometry.a),
        to: pdf(effect.geometry.b),
      });
    }
  });

  const api = {
    getCreationDraft: () => draftAnchorOf(),
    hasCreationDraft: () => store.model().draft?.kind.startsWith('create-') ?? false,
    finishCreationDraft: async () => {
      const draft = store.model().draft;
      if (!draft || !draft.kind.startsWith('create-')) return null;
      const commit = store.commit({
        type: draft.kind === 'create-ink' ? 'finishInkDraft' : 'finishCreationDraft',
      });
      return commit.effects.some((effect) => effect.type === 'create')
        ? createdRefOf(commit)
        : null;
    },
    finishInkDraft: () => {
      store.commit({ type: 'finishInkDraft' });
    },
    cancelCreationDraft: () => {
      store.commit({ type: 'cancel' });
    },
    cancel: () => {
      store.commit({ type: 'cancel' });
    },
    distanceCreationPage: () => {
      const draft = store.model().draft;
      return draft?.kind === 'create-distance' && draft.step === 'offset' ? draft.page : null;
    },
    onDraftCaptured: events.draftCaptured.on,
  };

  return { api };
}
