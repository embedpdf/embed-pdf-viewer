/** The destructive half: `doc.redaction.apply` in refs or pages scope. */
import { PluginError, annotationKey } from '@embedpdf/core';
import type { AnnotationRef, PageRef, RedactionApplyResult } from '@embedpdf/engine-core';

import type { RedactionCapability } from '../contract';
import type { RedactionPendingReads } from '../read/pending';
import type { RedactionContext, RedactionServices } from '../services';
import { ORIGIN_API } from '../services/events';

export function createApplying(
  ctx: RedactionContext,
  { events, store }: Pick<RedactionServices, 'events' | 'store'>,
  { listPending }: Pick<RedactionPendingReads, 'listPending'>,
) {
  const { applied } = events;
  const { requireService, pages } = store;

  const runApply = async (
    scope: Parameters<ReturnType<typeof requireService>['apply']>[0],
  ): Promise<RedactionApplyResult> => {
    const service = requireService();
    ctx.dispatch({ type: 'APPLY_STARTED' });
    try {
      const result = await service.apply(scope);
      ctx.dispatch({ type: 'APPLY_FINISHED', result });
      applied.emit({ result, origin: ORIGIN_API });
      return result;
    } catch (err) {
      ctx.dispatch({ type: 'APPLY_FINISHED', result: null });
      throw err;
    }
  };

  const apply = (refs: readonly AnnotationRef[]): Promise<RedactionApplyResult> => {
    const wanted = new Set(refs.map(annotationKey));
    const marks = listPending()
      .filter((mark) => wanted.has(annotationKey(mark.ref)))
      .map((mark) => mark.ref);
    if (marks.length === 0) {
      return Promise.reject(new PluginError('not-found', 'redaction', 'no matching pending marks'));
    }
    return runApply({ kind: 'annotations', refs: marks });
  };

  const applyPages = (targets: readonly PageRef[]): Promise<RedactionApplyResult> => {
    if (targets.length === 0) {
      return Promise.reject(new PluginError('invalid-input', 'redaction', 'no pages given'));
    }
    return runApply({ kind: 'pages', pages: [...targets] });
  };

  const applyAll = (): Promise<RedactionApplyResult> => {
    // Pages scope: authoritative for the WHOLE document, including marks on
    // pages this client never loaded. Pages without marks report 'unchanged'.
    const all = pages();
    if (all.length === 0) {
      return Promise.reject(new PluginError('not-ready', 'redaction', 'the document has no pages'));
    }
    return runApply({ kind: 'pages', pages: all });
  };

  return { api: { apply, applyPages, applyAll } satisfies Partial<RedactionCapability> };
}
