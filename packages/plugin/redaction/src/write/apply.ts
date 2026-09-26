/**
 * The destructive half: `doc.redaction.apply` in refs or pages scope. Applies
 * run one at a time, in call order, so each one sees the marks the previous
 * one left. The result reaches `lastResult` and `onApplied` through the
 * confirmed `redaction.applied` event, which the engine publishes before the
 * apply resolves; this area only brackets the call with the `applying` flag.
 */
import { PluginError, annotationKey } from '@embedpdf/core';
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

  /** Queue an apply whose scope is computed when its turn comes. */
  const runApply = (scopeOf: () => RedactionApplyScope): Promise<RedactionApplyResult> =>
    queue(async () => {
      const service = requireService();
      const scope = scopeOf();
      ctx.state.update(startApply);
      try {
        return await service.apply(scope);
      } finally {
        ctx.state.update(finishApply);
      }
    });

  const apply = (refs: readonly AnnotationRef[]): Promise<RedactionApplyResult> =>
    runApply(() => {
      const wanted = new Set(refs.map(annotationKey));
      const marks = listPending()
        .filter((mark) => wanted.has(annotationKey(mark.ref)))
        .map((mark) => mark.ref);
      if (marks.length === 0) {
        throw new PluginError('not-found', 'redaction', 'no matching pending marks');
      }
      return { annotations: marks };
    });

  const applyPages = (targets: readonly PageRef[]): Promise<RedactionApplyResult> => {
    if (targets.length === 0) {
      return Promise.reject(new PluginError('invalid-input', 'redaction', 'no pages given'));
    }
    return runApply(() => ({ pages: [...targets] }));
  };

  const applyAll = (): Promise<RedactionApplyResult> =>
    runApply(() => {
      // Pages scope is authoritative for the whole document, including marks
      // on pages this client never loaded. Pages without marks report 'unchanged'.
      const all = pages();
      if (all.length === 0) {
        throw new PluginError('not-ready', 'redaction', 'the document has no pages');
      }
      return { pages: all };
    });

  return { api: { apply, applyPages, applyAll } satisfies Partial<RedactionCapability> };
}
