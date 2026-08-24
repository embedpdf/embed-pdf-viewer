/**
 * @embedpdf/viewer — the SNIPPET door (`dist/embedpdf.js`).
 *
 * ```html
 * <div id="viewer" style="height:100vh"></div>
 * <script type="module">
 *   import EmbedPDF from 'https://cdn.jsdelivr.net/npm/@embedpdf/viewer@VERSION/dist/embedpdf.js';
 *   EmbedPDF.init({ target: '#viewer', src: '/report.pdf' });
 * </script>
 * ```
 *
 * The same local door, with one line of difference: the default wasm location.
 * Loaded as a real URL module, this door SELF-LOCATES — `embedpdf.wasm` ships as
 * a sibling in dist, so it resolves against wherever `embedpdf.js` itself lives
 * (jsDelivr when served from jsDelivr; an internal server when the folder is
 * copied there). No CDN URL is baked in: air-gapping the snippet is "copy the
 * dist folder", zero config. An explicit `engine` config still overrides it.
 */
import { registerLocalEngine } from '../local/register';

// Built dynamically (not a string literal) so no bundler treats it as a
// build-time asset reference — it is a RUNTIME sibling of this module.
const wasmFile = 'embedpdf.wasm';
registerLocalEngine({ wasmUrl: new URL(wasmFile, import.meta.url).href });

export * from '../local/surface';
export { default } from '../local/surface';
