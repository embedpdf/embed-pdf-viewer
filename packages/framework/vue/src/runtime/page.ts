/**
 * The page context: the seam between a page surface and its layers. A layer
 * depends only on this, never on the Stage, so the same layer works inside a
 * virtualized `<Stage>` page and on a standalone page surface. The surface
 * provides it as a ref that changes when the page's geometry does.
 */
import { inject, provide } from 'vue';
import type { InjectionKey, Ref } from 'vue';
// Pure coordinate math from the geometry base, not from stage-core: the page
// context stays stage-agnostic.
import type { PageTransform } from '@embedpdf/core-geometry';
import type { PageViewDemand } from '@embedpdf/plugin-render/contract';
import type { PageContext } from '@embedpdf/web';

// Built by `makePageContext` from `@embedpdf/web`, shared with every framework.
export { makePageContext } from '@embedpdf/web';

/** The page context. Its members are documented on `PageContext` in `@embedpdf/web`. */
export type PageContextValue = PageContext<PageTransform, PageViewDemand>;

const PageKey: InjectionKey<Readonly<Ref<PageContextValue>>> = Symbol('embedpdf page');

/** Installed by page surfaces (`<Stage>` pages), not by app code. */
export function providePage(page: Readonly<Ref<PageContextValue>>): void {
  provide(PageKey, page);
}

/**
 * The page this component is drawn on, as a ref: inside a `<Stage>`'s
 * `#page` or `#page-chrome` slot. The ref is the same for the page's life;
 * its value changes when the page's geometry does (a zoom, a rotation).
 */
export function usePage(): Readonly<Ref<PageContextValue>> {
  const page = inject(PageKey, null);
  if (!page) throw new Error('usePage must be used inside a <Stage> page');
  return page;
}
