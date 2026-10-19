/**
 * @embedpdf/vue/link: the Vue surface of `@embedpdf/plugin-link`.
 *
 * `<LinkLayer>` makes a page's links clickable while a navigation tool is
 * active, with a `#link` slot to draw them yourself; `useLink()` follows links
 * from code (and opens websites while a component uses it), and
 * `useLinkEvent()` follows the plugin's events.
 */

// One line per feature: registration travels with the UI.
export * from '@embedpdf/plugin-link';
export { default as LinkLayer } from './link/LinkLayer.vue';
export { useLink, useLinkEvent } from './link/composables';
