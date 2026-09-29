import {
  creationDraftAnchor,
  type CreationDraftAnchor,
  type Model,
} from '@embedpdf/core-annotation';

import type { AnnotationServices } from '../services';
import { createdRefOf } from './outcomes';

/**
 * Creation drafts: the live multi-click or buffered-ink draft a gesture
 * builds, its commit and cancel doors, and the captured-draft seam the
 * measurement plugin calibrates from.
 */
export function createDrafts({ store, events }: Pick<AnnotationServices, 'store' | 'events'>) {
  let anchorCache: { model: Model; v: CreationDraftAnchor | null } | null = null;
  const draftAnchorOf = (): CreationDraftAnchor | null => {
    const model = store.model();
    if (anchorCache && anchorCache.model === model) return anchorCache.v;
    const anchor = creationDraftAnchor(model);
    anchorCache = { model: model, v: anchor };
    return anchor;
  };

  // A capture-only tool (the measurement calibration line) reports its draft
  // instead of creating anything.
  store.onEffect('captured', (effect) => {
    if (effect.geometry.kind === 'line') {
      events.draftCaptured.emit({
        tool: effect.tool,
        page: effect.page,
        from: effect.geometry.linePoints.start,
        to: effect.geometry.linePoints.end,
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
