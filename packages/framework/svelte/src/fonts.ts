/**
 * @embedpdf/svelte/fonts — a document's fonts, and the programs a browser draws text in them with.
 *
 * The plugin lists the document's fonts the first time something reads them, and keeps the list
 * live as writes add fonts and the engine's own fonts change:
 *
 *   const fonts = useFonts();
 *   const state = useFontsState(); // state.fonts, state.status
 *   const css = useFontCss('helvetica'); // css.current, its programs mounted while the component lives
 */

// Registration travels with the UI.
export * from '@embedpdf/plugin-fonts';

export { useFontCss, useFonts, useFontsEvent, useFontsState } from './fonts/readers';
export { useFontMounts } from './runtime/font-mounts.svelte';
