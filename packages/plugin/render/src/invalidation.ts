/**
 * The built-in event → pixels map: which pages' rasters a confirmed fact
 * repaints, and at which scope. `annotations` scope repaints the annotated
 * rasters only; `content` scope repaints the page content as well (a
 * redaction or a flatten rewrites the content stream). Over-invalidation is
 * acceptable (a z-order move that changes nothing repaints one thumbnail);
 * under-invalidation is the bug.
 *
 * The map ignores origin: a baked raster is stale whether this session moved
 * the highlight or a collaborator did. Events fire only for confirmed
 * mutations, so a drag invalidates once at commit; optimistic previews live
 * in the overlay, never here.
 */
import type { DocumentEvent, PageObjectNumber, PageRef } from '@embedpdf/core';

import type { InvalidateScope } from './contract';

export interface PixelChange {
  readonly pages: readonly PageObjectNumber[];
  readonly scope: InvalidateScope;
}

const placedPages = (widgets: ReadonlyArray<{ page: PageRef | null }>): PageObjectNumber[] =>
  widgets.flatMap((widget) => (widget.page ? [widget.page.pageObjectNumber] : []));

const annotations = (pages: readonly PageObjectNumber[]): PixelChange | null =>
  pages.length ? { pages, scope: 'annotations' } : null;

const content = (pages: readonly PageObjectNumber[]): PixelChange | null =>
  pages.length ? { pages, scope: 'content' } : null;

export function pixelChangeOf(
  event: DocumentEvent,
  allPageObjectNumbers: () => PageObjectNumber[],
): PixelChange | null {
  switch (event.type) {
    case 'annotation.created':
    case 'annotation.updated':
    case 'annotation.deleted':
    case 'annotation.moved': // z-order move: baked stacking can change
      return annotations([event.page.pageObjectNumber]);
    // A field's widgets can live on several pages; the results name exactly
    // the widgets whose appearance changed, each with its page. An unplaced
    // widget (`page: null`) has no pixels to repaint.
    case 'form.valueChanged':
    case 'form.effectsApplied':
      return annotations(placedPages(event.changedWidgets));
    case 'form.fieldDeleted':
      return annotations(placedPages(event.removedWidgets));
    case 'form.fieldCreated':
    case 'form.fieldUpdated':
    case 'form.widgetAttached':
    case 'form.widgetDetached':
      return annotations(placedPages(event.field.widgets));
    // Coarse results (counts only, no per-widget detail): repaint every page.
    case 'form.imported':
    case 'form.repaired':
      return annotations(allPageObjectNumbers());
    // Sealing bakes the signature into its widget's appearance.
    case 'signature.completed':
      return annotations(event.signature.widget ? placedPages([event.signature.widget]) : []);
    // These rewrite the page content itself.
    case 'redaction.applied':
    case 'pages.flattened':
      return content(
        event.results
          .filter((result) => result.status === 'applied')
          .map((result) => result.page.pageObjectNumber),
      );
    case 'annotations.flattened':
      return content(
        event.results.some((result) => result.status === 'applied')
          ? [event.page.pageObjectNumber]
          : [],
      );
    // The stream lost events that will never arrive: any page may be stale.
    case 'stream.desynced':
      return content(allPageObjectNumbers());
    // pages.* replace the page registry: the kernel's `revision` bump already
    // re-keys every layout, and metadata never touches pixels. A new saved
    // version changes no pixels beyond the signature it seals.
    default:
      return null;
  }
}
