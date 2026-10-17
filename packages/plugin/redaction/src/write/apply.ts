/**
 * The destructive half: `doc.redaction.apply` in refs or pages scope. Applies
 * run one at a time, in call order, so each one sees the marks the previous
 * one left. The result reaches `lastResult` and `onApplied` through the
 * confirmed `redaction.applied` event, which the engine publishes before the
 * apply resolves; this area only brackets the call with the `applying` flag.
 */
import { PluginError, annotationKey, type OperationOptions } from '@embedpdf/core';
import type {
  AnnotationRef,
  PageRef,
  RedactionApplyResult,
  RedactionApplyScope,
} from '@embedpdf/engine-core';

import type { RedactionCapability } from '../contract';
import { finishApply, startApply } from '../model';
import type { RedactionPendingReads } from '../read/pending';
import type { RedactionContext, RedactionServices } from '../services';

export function createApplying(
  ctx: RedactionContext,
  { store }: Pick<RedactionServices, 'store'>,
  { listPending }: Pick<RedactionPendingReads, 'listPending'>,
) {
  const { requireService, pages } = store;
  const queue = ctx.serialQueue('apply');
  // A download waits for a redaction being applied: its content must not be in the file.
  ctx.onSettle(() => queue.idle());

  /**
   * Queue an apply whose scope is computed when its turn comes. One whose
   * signal fired while it waited never starts; one cancelled while the
   * engine applies rejects `operation-cancelled` at once, and the engine's
   * `redaction.applied` says what it removed.
   */
  const runApply = (
    scopeOf: () => RedactionApplyScope,
    options: OperationOptions | undefined,
  ): Promise<RedactionApplyResult> =>
    queue(
      async () => {
        const service = requireService();
        const scope = scopeOf();
        ctx.state.update(startApply);
        try {
          return await ctx.cancellable(options?.signal, service.apply(scope));
        } finally {
          ctx.state.update(finishApply);
        }
      },
      { signal: options?.signal },
    );

  const apply = (
    refs: readonly AnnotationRef[],
    options?: OperationOptions,
  ): Promise<RedactionApplyResult> =>
    runApply(() => {
      const wanted = new Set(refs.map(annotationKey));
      const marks = listPending()
        .filter((mark) => wanted.has(annotationKey(mark.ref)))
        .map((mark) => mark.ref);
      if (marks.length === 0) {
        throw new PluginError('not-found', 'redaction', 'no matching pending marks');
      }
      return { annotations: marks };
    }, options);

  const applyPages = async (
    targets: readonly (PageRef | number)[],
    options?: OperationOptions,
  ): Promise<RedactionApplyResult> => {
    if (targets.length === 0) {
      throw new PluginError('invalid-input', 'redaction', 'no pages given');
    }
    // Every page is resolved first: a page that isn't there refuses the call.
    const pages = targets.map((page) => ctx.pageOf(page).ref);
    return runApply(() => ({ pages }), options);
  };

  const applyAll = (options?: OperationOptions): Promise<RedactionApplyResult> =>
    runApply(() => {
      // Pages scope is authoritative for the whole document, including marks
      // on pages this client never loaded. Pages without marks report 'unchanged'.
      const all = pages();
      if (all.length === 0) {
        throw new PluginError('not-ready', 'redaction', 'the document has no pages');
      }
      return { pages: all };
    }, options);

  return { api: { apply, applyPages, applyAll } satisfies Partial<RedactionCapability> };
}
