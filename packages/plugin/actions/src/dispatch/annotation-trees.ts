/**
 * Annotation reads carry their action trees with destinations in the file's
 * coordinates; everything the dispatcher runs is in page space. A tree read
 * from an annotation converts here, as it enters a run.
 */
import type { PluginContext } from '@embedpdf/core';
import {
  pageActionTreeOf,
  type PdfActionTree,
  type PdfDestination,
  type PdfRect,
} from '@embedpdf/engine-core/runtime';

/** A stand-in box for a page the document doesn't have: the `goto` executor refuses such a page, so its numbers are never read. */
const NO_PAGE: PdfRect = { left: 0, bottom: 0, right: 0, top: 0 };

/** An annotation's action tree in page space, each `goto` measured on the page it goes to. */
export function annotationTreeInPageSpace(
  geometry: PluginContext<unknown>['geometry'],
  tree: PdfActionTree<PdfDestination>,
): PdfActionTree {
  return pageActionTreeOf(tree, (page) => geometry.tryForPage(page)?.crop ?? NO_PAGE);
}
