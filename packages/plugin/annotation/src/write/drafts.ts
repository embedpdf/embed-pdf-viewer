import {
  creationDraftAnchor,
  type CreationDraftAnchor,
  type Draft,
  type Model,
} from '@embedpdf/core-annotation';
import type { Annotation } from '@embedpdf/engine-core/runtime';

import type { AnnotationReads } from '../read/annotations';
import type { AnnotationContext, AnnotationServices } from '../services';
import { createdRefOf } from './outcomes';

/**
 * Creation drafts: the polygon or polyline a click per point builds, its
 * finish and cancel doors, and the captured-draft seam the measurement plugin
 * calibrates from. Also the pen drawing that waits for its next stroke: the
 * wait, and everything that ends it.
 */
export function createDrafts(
  ctx: Pick<AnnotationContext, 'cancellable' | 'clock' | 'onSettle'>,
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
      { adjust: afterCreate.shape(toolId) },
    );
    afterCreate.done(toolId, commit);
    if (!commit.effects.some((effect) => effect.type === 'create')) return null;
    const ref = await ctx.cancellable(options.signal, createdRefOf(commit));
    const annotation = annotations.get(ref);
    return annotation ? { annotation } : null;
  };

  // ── the pen drawing that waits for its next stroke ───────────────────────

  /**
   * The wait that is running: the draft as the pen left it, the tool that
   * drew it, the tool that was active then, and the wait's cancel. It speaks
   * for the drawing only while the model's draft is that same object: the
   * next stroke, and whatever ends the drawing, put another draft there.
   */
  let wait: {
    readonly draft: Draft;
    readonly toolId: string | undefined;
    readonly activeToolId: string | undefined;
    readonly cancel: () => void;
  } | null = null;

  /** The ink draft whose pen is up, or null: a stroke still being drawn is not waiting. */
  const waitingInk = (): Draft | null => {
    const draft = store.model().draft;
    return draft?.kind === 'create-ink' && !draft.drawing ? draft : null;
  };

  /**
   * Make the drawing that waits an annotation now, as its tool's
   * `afterCreate` says. With `selects: false` the selection stays as it is:
   * what ended the wait decides it.
   */
  const finishWaitingInk = ({ selects = true }: { selects?: boolean } = {}): void => {
    const draft = waitingInk();
    if (!draft) return;
    const running = wait?.draft === draft ? wait : null;
    wait?.cancel();
    wait = null;
    const toolId = running ? running.toolId : tools.activeTool()?.id;
    const { selected } = store.model();
    const commit = store.commit(
      { type: 'finishInkDraft' },
      {
        adjust: selects
          ? afterCreate.shape(toolId)
          : (result) => ({ ...result, session: { ...result.session, selected } }),
      },
    );
    // Going back to the default tool is for a user still on the tool they
    // drew with. After a tool change the choice is theirs.
    if (!running || running.activeToolId === tools.activeTool()?.id) {
      afterCreate.done(toolId, commit);
    }
  };

  /**
   * The pen is up and its stroke is held back: wait `delayMs` for the next
   * stroke of the same drawing. When none comes, the drawing is finished.
   */
  const waitForNextStroke = (toolId: string | undefined, delayMs: number): void => {
    const draft = waitingInk();
    if (!draft) return;
    wait?.cancel();
    const cancel = ctx.clock.after(delayMs, () => {
      // Only the drawing this wait was started for.
      if (store.model().draft === draft) finishWaitingInk();
    });
    wait = { draft, toolId, activeToolId: tools.activeTool()?.id, cancel };
  };

  // A message that takes the drawing's place in the draft finishes it first.
  store.onWaitingInk(() => finishWaitingInk({ selects: false }));
  // A download finishes it too. A stroke still being drawn is left alone: it
  // is not what the user sees as done yet.
  ctx.onSettle(() => finishWaitingInk());

  /** The `draft` noun. */
  const draftApi = {
    get: () => draftAnchorOf(),
    finish,
    cancel: () => {
      store.commit({ type: 'cancel' });
    },
  };

  const api = {
    finishInkDraft: () => finishWaitingInk(),
    cancel: () => {
      store.commit({ type: 'cancel' });
    },
    getDistanceCreationPage: () => {
      const draft = store.model().draft;
      return draft?.kind === 'create-distance' && draft.step === 'offset' ? draft.page : null;
    },
    onDraftCaptured: events.draftCaptured.on,
    hasCreationAwaitingClick: () => {
      const draft = store.model().draft;
      return (
        draft?.kind === 'create-poly' ||
        draft?.kind === 'create-callout' ||
        (draft?.kind === 'create-distance' && draft.step === 'offset')
      );
    },
  };

  return { draft: draftApi, api, waitForNextStroke };
}

export type Drafts = ReturnType<typeof createDrafts>;
