import {
  creationDraftAnchor,
  type CreationDraftAnchor,
  type Model,
} from '@embedpdf/core-annotation';
import type { Annotation } from '@embedpdf/engine-core/runtime';

import type { AnnotationReads } from '../read/annotations';
import type { AnnotationContext, AnnotationServices } from '../services';
import { createdRefOf } from './outcomes';

/**
 * Creation drafts: the polygon or polyline a click per point builds (and the
 * buffered ink strokes), its finish and cancel doors, and the captured-draft
 * seam the measurement plugin calibrates from.
 */
export function createDrafts(
  ctx: Pick<AnnotationContext, 'cancellable'>,
  {
    store,
    events,
    tools,
    afterCreate,
  }: Pick<AnnotationServices, 'store' | 'events' | 'tools' | 'afterCreate'>,
  annotations: Pick<AnnotationReads, 'get'>,
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

  /** End the draft as a double-click does, through the active tool's `afterCreate`. */
  const finish = async (
    options: { signal?: AbortSignal } = {},
  ): Promise<{ annotation: Annotation } | null> => {
    const draft = store.model().draft;
    if (!draft || !draft.kind.startsWith('create-')) return null;
    const toolId = tools.activeTool()?.id;
    const commit = store.commit(
      { type: draft.kind === 'create-ink' ? 'finishInkDraft' : 'finishCreationDraft' },
      afterCreate.shape(toolId),
    );
    afterCreate.done(toolId, commit);
    if (!commit.effects.some((effect) => effect.type === 'create')) return null;
    const ref = await ctx.cancellable(options.signal, createdRefOf(commit));
    const annotation = annotations.get(ref);
    return annotation ? { annotation } : null;
  };

  /** The `draft` noun. */
  const draftApi = {
    get: () => draftAnchorOf(),
    finish,
    cancel: () => {
      store.commit({ type: 'cancel' });
    },
  };

  const api = {
    finishInkDraft: () => {
      const toolId = tools.activeTool()?.id;
      afterCreate.done(toolId, store.commit({ type: 'finishInkDraft' }, afterCreate.shape(toolId)));
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

  return { draft: draftApi, api };
}
