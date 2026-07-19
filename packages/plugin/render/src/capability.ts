import type { PluginContext } from '@embedpdf/core';
import type { RenderAction, RenderCapability, RenderState } from './types';

/**
 * Render a page through the document's engine handle, addressed by its durable pon.
 * The engine returns an AbortablePromise, which we wire to the caller's signal.
 */
export function createRenderCapability(
  ctx: PluginContext<RenderState, RenderAction>,
): RenderCapability {
  return {
    renderPage(pon, { scale, includeAnnotations, signal }) {
      const doc = ctx.doc;
      if (!doc) return Promise.reject(new Error('render: no document bound'));
      const task = doc
        .page(pon)
        .render.image({ viewport: { kind: 'scale', scale }, includeAnnotations });
      if (signal) {
        if (signal.aborted) task.abort(signal.reason);
        else signal.addEventListener('abort', () => task.abort(signal.reason), { once: true });
      }
      return task; // AbortablePromise<PageImageHandle> is a Promise<PageImageHandle>
    },
    renderEpoch(pon, includeAnnotations = true) {
      // The sum of two monotonic counters is itself a valid monotonic version:
      // a content bump reaches BOTH products; an annotation bump only this one.
      const s = ctx.getState();
      const content = s.contentEpochs[pon] ?? 0;
      if (!includeAnnotations) return content;
      return content + (s.annotatedEpochs[pon] ?? 0);
    },
    invalidate({ pons, scope = 'content' } = {}) {
      const target = pons ?? (ctx.document()?.pages ?? []).map((p) => p.pageObjectNumber);
      if (target.length) ctx.dispatch({ type: 'INVALIDATE', scope, pons: target });
    },
  };
}
