/** The props of `<PageView>`. */
import type { Snippet } from 'svelte';
import type { PageRef } from '@embedpdf/core';
import type { PageFrame } from '@embedpdf/core-geometry';
import type { PageContextValue } from '../runtime/page';

export interface PageViewProps {
  /** The page: its `ref`, which follows it when pages move, or its index, from 0. */
  page: PageRef | number;
  /** Which document to show. Defaults to the active document. */
  documentId?: string;
  /** Shown while the document or the page is not available yet (default: nothing). */
  fallback?: Snippet;
  /** The width of the page upright, in pixels: a page turned a quarter is that tall. Default 240. */
  width?: number;
  /** Space reserved around the page for your own labels, in pixels per side; the sides left out are 0. */
  pageFrame?: Partial<PageFrame>;
  /**
   * Page-space content (`<RenderLayer>`, the selection, search matches): what you write between
   * `<PageView>` and `</PageView>`, or `{#snippet children(page)}` when it needs the page. It turns
   * with the page, and positions are PDF points.
   */
  children: Snippet<[page: PageContextValue]>;
  /**
   * Box-space chrome (a label, a border) drawn into the outer box, page and `pageFrame`. It never
   * turns, like `<Stage>`'s `pageChrome`.
   */
  pageChrome?: Snippet<[page: PageContextValue]>;
  /** On the outer box, after its own. */
  class?: string;
  /** On the outer box, after its own. */
  style?: string;
}
