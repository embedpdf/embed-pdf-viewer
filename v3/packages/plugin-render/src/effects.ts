/**
 * Makes page rasters REACTIVE — the same event-stream pattern the metadata
 * and annotation plugins use.
 *
 * A render bakes whatever the engine knows into the bitmap, so it goes stale
 * the moment a confirmed mutation changes those pixels. This effect is the
 * BUILT-IN door for such facts: it subscribes to the document event stream
 * and bumps the touched pages' ledger (see reducer.ts); layers key their
 * fetch on `renderEpoch(pon)` and refetch on the bump. The OTHER door is the
 * capability's `invalidate` verb — for plugins whose mutation vocabulary
 * this map doesn't know (redaction, text edit, third-party).
 *
 * Deliberately ORIGIN-AGNOSTIC (unlike the annotation plugin's remote-only
 * fold): a baked raster is stale whether YOU moved the highlight or a
 * collaborator did — the event model's exactly-once guarantee means one bump
 * either way. And because events fire only on CONFIRMED mutations, a drag
 * invalidates once at commit — optimistic previews live in the overlay, never
 * here.
 */
import type { DocumentEvent, EffectContext, PageObjectNumber } from '@embedpdf-x/kernel';
import type { RenderAction, RenderState } from './types';

/**
 * Which pages' ANNOTATED raster a confirmed mutation repaints — the whole
 * event→scope map. Everything the engine emits today is appearance-scoped;
 * when it grows content-mutation events (redaction.applied, content.edited),
 * they get a case here dispatching scope 'content'. Over-invalidation is
 * acceptable (a z-order move that changes nothing repaints one thumb);
 * under-invalidation is the bug.
 */
export function annotatedPons(
  event: DocumentEvent,
  allPons: () => PageObjectNumber[],
): PageObjectNumber[] {
  switch (event.type) {
    case 'annotation.created':
    case 'annotation.updated':
    case 'annotation.deleted':
    case 'annotation.moved': // z-order move — baked stacking can change
      return [event.pageObjectNumber];
    // A field's widgets can live on several pages; the results name exactly
    // the widgets whose appearance changed, each with its page.
    case 'form.valueChanged':
    case 'form.effectsApplied':
      return event.changedWidgets.map((w) => w.pageObjectNumber);
    case 'form.fieldDeleted':
      return event.removedWidgets.map((w) => w.pageObjectNumber);
    case 'form.fieldCreated':
    case 'form.fieldUpdated':
    case 'form.widgetAttached':
    case 'form.widgetDetached':
      return event.field.widgets.map((w) => w.pageObjectNumber);
    // Coarse results (counts only, no per-widget detail) — repaint every page.
    case 'form.imported':
    case 'form.repaired':
      return allPons();
    // pages.* replace the page registry: the kernel's `revision` bump already
    // re-keys every layout, and metadata never touches pixels.
    default:
      return [];
  }
}

export function registerRenderEffects(ctx: EffectContext<RenderState, RenderAction>): void {
  const doc = ctx.doc;
  if (!doc) return;
  const allPons = () => (ctx.document()?.pages ?? []).map((p) => p.pageObjectNumber);
  const unsubscribe = doc.events.subscribe((event: DocumentEvent) => {
    const pons = annotatedPons(event, allPons);
    if (pons.length) ctx.dispatch({ type: 'INVALIDATE', scope: 'annotations', pons });
  });
  ctx.cleanup(unsubscribe);
}
