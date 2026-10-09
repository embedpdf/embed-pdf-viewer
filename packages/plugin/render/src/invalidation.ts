/**
 * The built-in event → pixels map: which pages' pictures a confirmed fact
 * repaints, and at which scope. `annotations` scope repaints the pictures
 * that draw annotations, `fields` the ones that draw form fields, and
 * `content` every picture (a redaction or a flatten rewrites the content
 * stream). Over-invalidation is acceptable (a z-order move that changes
 * nothing repaints one thumbnail); under-invalidation is the bug.
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
  widgets.flatMap((widget) => (widget.page ? [widget.page.objectNumber] : []));

const changeOf = (
  pages: readonly PageObjectNumber[],
  scope: InvalidateScope,
): PixelChange | null => (pages.length ? { pages: [...new Set(pages)], scope } : null);

/**
 * The pages a form fact repaints. Every form fact names the widgets whose
 * look changed or that went (`meta.changedWidgets`), each with its page; the
 * widget rows it carries, and a deleted widget's page, are counted too. An
 * unplaced widget (`page: null`) has no pixels to repaint.
 */
function formPagesOf(
  event: Extract<DocumentEvent, { meta: { changedWidgets: unknown } }>,
): PageObjectNumber[] {
  const pages = placedPages(event.meta.changedWidgets);
  if ('widgets' in event) pages.push(...placedPages(event.widgets));
  if ('page' in event && event.page) pages.push(event.page.objectNumber);
  return pages;
}

export function pixelChangeOf(
  event: DocumentEvent,
  allPageObjectNumbers: () => PageObjectNumber[],
): PixelChange | null {
  switch (event.type) {
    case 'annotations.created':
    case 'annotations.updated':
    case 'annotations.deleted':
    case 'annotations.restored':
    case 'annotations.reordered': // z-order: baked stacking can change
      return changeOf([event.page.objectNumber], 'annotations');
    case 'forms.valueSet':
    case 'forms.effectsApplied':
    case 'forms.created':
    case 'forms.updated':
    case 'forms.deleted':
    case 'forms.restored':
    case 'forms.widgetAdded':
    case 'forms.widgetRemoved':
    case 'forms.widgetDeleted':
    case 'forms.widgetRestored':
    case 'forms.widgetUpdated':
    case 'forms.widgetsReordered':
      return changeOf(formPagesOf(event), 'fields');
    // A coarse result (counts only, no per-widget detail): repaint every page.
    case 'forms.repaired':
      return changeOf(allPageObjectNumbers(), 'fields');
    // Sealing bakes the signature into its widget's appearance.
    case 'signatures.completed':
      return changeOf(
        event.signature.widget ? placedPages([event.signature.widget]) : [],
        'fields',
      );
    // These rewrite the page content itself.
    case 'redaction.applied':
    case 'pages.flattened':
      return changeOf(
        event.results
          .filter((result) => result.status === 'applied')
          .map((result) => result.page.objectNumber),
        'content',
      );
    case 'annotations.flattened':
      return changeOf(
        event.results.some((result) => result.status === 'applied')
          ? [event.page.objectNumber]
          : [],
        'content',
      );
    // The stream lost events that will never arrive: any page may be stale.
    case 'stream.desynced':
      return changeOf(allPageObjectNumbers(), 'content');
    // pages.* replace the page registry: the kernel's `revision` bump already
    // re-keys every layout, and metadata never touches pixels. A new saved
    // version changes no pixels beyond the signature it seals. The
    // calculation order changes no pixels.
    default:
      return null;
  }
}
