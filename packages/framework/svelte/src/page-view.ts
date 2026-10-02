/**
 * @embedpdf/svelte/page-view — one page on its own, with no Stage.
 *
 * `<PageView>` shows a page anywhere in an app (a preview in a card, a page picker) with the same
 * layers, rotation and chrome frame as a Stage page, and anchored UI that works inside it.
 */
export { default as PageView } from './page-view/PageView.svelte';
export type { PageViewProps } from './page-view/props';
