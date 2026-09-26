import { pageSpace } from '@embedpdf/core-geometry';
import {
  creationDraftAnchor,
  type CreationDraftAnchor,
  type Model,
  type Vec,
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
    const m = store.model();
    if (anchorCache && anchorCache.model === m) return anchorCache.v;
    const v = creationDraftAnchor(m);
    anchorCache = { model: m, v };
    return v;
  };

  // A capture-only tool (the measurement calibration line) reports its draft
  // in PDF user space instead of creating anything.
  store.onEffect('captured', (fx) => {
    if (!ctx.doc) return;
    const crop = geometry.cropOf(fx.page.pageObjectNumber);
    if (crop && fx.geom.t === 'line') {
      const pdf = (p: Vec) => pageSpace(crop).pageToPdf(p);
      events.draftCaptured.emit({
        tool: fx.tool,
        page: fx.page,
        from: pdf(fx.geom.a),
        to: pdf(fx.geom.b),
      });
    }
  });

  const api = {
    getCreationDraft: () => draftAnchorOf(),
    hasCreationDraft: () => store.model().draft?.g.startsWith('create-') ?? false,
    finishCreationDraft: async () => {
      const draft = store.model().draft;
      if (!draft || !draft.g.startsWith('create-')) return null;
      const effects = store.commit({
        t: draft.g === 'create-ink' ? 'finishInkDraft' : 'finishCreationDraft',
      });
      const fx = writes.createEffectsOf(effects)[0];
      return fx ? writes.awaitCreate(fx.id) : null;
    },
    finishInkDraft: () => {
      store.commit({ t: 'finishInkDraft' });
    },
    cancelCreationDraft: () => {
      store.commit({ t: 'cancel' });
    },
    cancel: () => {
      store.commit({ t: 'cancel' });
    },
    distanceCreationPage: () => {
      const draft = store.model().draft;
      return draft?.g === 'create-distance' && draft.step === 'offset' ? draft.page : null;
    },
    onDraftCaptured: events.draftCaptured.on,
  };

  return { api };
}
