/**
 * The page context: what a layer knows about the page it draws on. A layer depends only on this,
 * never on the Stage, so the same layer works on a Stage page and on a single `<PageView>`.
 *
 * A page surface provides it as a function that returns the current value; `usePage()` gives a
 * layer an object that reads through that function on every access, so `page.transform` in a
 * template or a `$derived` follows the zoom.
 */
import { getContext, hasContext, setContext } from 'svelte';
import type { PageTransform } from '@embedpdf/core-geometry';
import type { PageViewDemand } from '@embedpdf/plugin-render/contract';
import type { PageContext } from '@embedpdf/web';

// Built by `makePageContext`, and kept current by `livePageContext`, from `@embedpdf/web`.
export { livePageContext, makePageContext } from '@embedpdf/web';

/** The page context. Its members are documented on `PageContext` in `@embedpdf/web`. */
export type PageContextValue = PageContext<PageTransform, PageViewDemand>;

const PAGE = Symbol('embedpdf.page');

/** For page surfaces (`<Stage>`'s pages, `<PageView>`): provide the page to everything inside. */
export function setPageContext(page: PageContextValue): void {
  setContext(PAGE, page);
}

/** The page this layer draws on. Throws outside a page surface. */
export function usePage(): PageContextValue {
  if (!hasContext(PAGE)) {
    throw new Error('[embedpdf] usePage() must be used inside <PageView> or a <Stage> page.');
  }
  return getContext<PageContextValue>(PAGE);
}
