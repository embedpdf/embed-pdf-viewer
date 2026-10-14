/**
 * @embedpdf/vue/page-view: one page on its own, without a Stage.
 *
 * `<PageView :page :width>` shows a page anywhere in your app (a preview card,
 * a page picker, the page a comment belongs to) with the same layers, rotation
 * and chrome frame as a Stage page. Loop over `usePageList()` (from
 * `@embedpdf/vue/runtime`) for a picker; for a long strip that scrolls, a
 * second Stage mounts only what's on screen.
 */
export { default as PageView } from './page-view/PageView.vue';
