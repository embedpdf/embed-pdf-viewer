import { pageSpace } from '@embedpdf/core-geometry';
import {
  creationDraftAnchor,
  type CreationDraftAnchor,
  type Model,
  type Point,
} from '@embedpdf/core-annotation';

import type { AnnotationContext, AnnotationServices } from '../services';

/**
 * Creation drafts: the live multi-click or buffered-ink draft a gesture
 * builds, its commit and cancel doors, and the captured-draft seam the
 * measurement plugin calibrates from.
 */
export function createDrafts(
  ctx: Pick<AnnotationContext, 'doc'>,
  {
    store,
    geometry,
    writes,
    events,
  }: Pick<AnnotationServices, 'store' | 'geometry' | 'writes' | 'events'>,
) {
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
  store.onEffect('captured', (fx) => {
    if (!ctx.doc) return;
    const crop = geometry.cropOf(fx.page.pageObjectNumber);
    if (crop && fx.geometry.kind === 'line') {
      const pdf = (point: Point) => pageSpace(crop).pageToPdf(point);
      events.draftCaptured.emit({
        tool: fx.tool,
        page: fx.page,
        from: pdf(fx.geometry.a),
        to: pdf(fx.geometry.b),
      });
    }
  });

  const api = {
    getCreationDraft: () => draftAnchorOf(),
    hasCreationDraft: () => store.model().draft?.kind.startsWith('create-') ?? false,
    finishCreationDraft: async () => {
      const draft = store.model().draft;
      if (!draft || !draft.kind.startsWith('create-')) return null;
      const effects = store.commit({
        type: draft.kind === 'create-ink' ? 'finishInkDraft' : 'finishCreationDraft',
      });
      const fx = writes.createEffectsOf(effects)[0];
      return fx ? writes.awaitCreate(fx.id) : null;
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
