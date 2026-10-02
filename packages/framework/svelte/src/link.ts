/**
 * @embedpdf/svelte/link — following links.
 *
 * `<LinkLayer>` puts a real anchor over each link on a page (draw around it with its `link`
 * snippet); `useLink()` is the plugin's API and opens websites while it's in use, and
 * `useLinkEvent()` its events.
 */

// Registration travels with the UI.
export * from '@embedpdf/plugin-link';

export { default as LinkLayer } from './link/LinkLayer.svelte';
export type { LinkLayerProps, LinkRenderProps } from './link/props';
export { useLink, useLinkEvent } from './link/readers.svelte';
