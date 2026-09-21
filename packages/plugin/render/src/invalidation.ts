/**
 * The built-in event → pages map: which pages' ANNOTATED raster a confirmed
 * mutation repaints. Everything the engine emits today is appearance-scoped;
 * content-mutation events (`redaction.applied`) are handled by the
 * controller with scope 'content'. Over-invalidation is acceptable (a
 * z-order move that changes nothing repaints one thumb); under-invalidation
 * is the bug.
 *
 * Deliberately ORIGIN-AGNOSTIC: a baked raster is stale whether YOU moved the
 * highlight or a collaborator did. And because events fire only on CONFIRMED
 * mutations, a drag invalidates once at commit — optimistic previews live in
 * the overlay, never here.
 */
import type { DocumentEvent, PageObjectNumber, PageRef } from '@embedpdf/core';

const placedPages = (widgets: ReadonlyArray<{ page: PageRef | null }>): PageObjectNumber[] =>
  widgets.flatMap((w) => (w.page ? [w.page.pageObjectNumber] : []));

export function annotatedPons(
  event: DocumentEvent,
  allPons: () => PageObjectNumber[],
): PageObjectNumber[] {
  switch (event.type) {
    case 'annotation.created':
    case 'annotation.updated':
    case 'annotation.deleted':
    case 'annotation.moved': // z-order move — baked stacking can change
      return [event.page.pageObjectNumber];
    // A field's widgets can live on several pages; the results name exactly
    // the widgets whose appearance changed, each with its page. An unplaced
    // widget (`page: null`) has no pixels to repaint.
    case 'form.valueChanged':
    case 'form.effectsApplied':
      return placedPages(event.changedWidgets);
    case 'form.fieldDeleted':
      return placedPages(event.removedWidgets);
    case 'form.fieldCreated':
    case 'form.fieldUpdated':
    case 'form.widgetAttached':
    case 'form.widgetDetached':
      return placedPages(event.field.widgets);
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
