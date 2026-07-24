/**
 * @embedpdf/viewer — the SNIPPET entry, built as `dist/embedpdf.js`.
 *
 * ```html
 * <div id="viewer" style="height:100vh"></div>
 * <script type="module">
 *   import EmbedPDF from 'https://cdn.jsdelivr.net/npm/@embedpdf/viewer@VERSION/dist/embedpdf.js';
 *   EmbedPDF.init({ target: '#viewer', src: '/report.pdf' });
 * </script>
 * ```
 *
 * One line of difference from the npm entry: the default wasm location.
 * Loaded as a real URL module, this entry SELF-LOCATES — `pdfium.wasm` ships
 * as a sibling in dist, so it resolves against wherever `embedpdf.js` itself
 * lives (jsDelivr when served from jsDelivr; an internal server when the
 * folder is copied there). No CDN URL is baked in: air-gapping the snippet is
 * "copy the dist folder", zero config. An explicit `engine` config still
 * overrides this default (see ./config.ts).
 */
import { setSnippetWasmUrl } from './runtime-defaults';
import EmbedPDF from './index';

// Built dynamically (not a string literal) so no bundler treats it as a
// build-time asset reference — it is a RUNTIME sibling of this module.
const wasmFile = 'pdfium.wasm';
setSnippetWasmUrl(new URL(wasmFile, import.meta.url).href);

export * from './index';
export default EmbedPDF;
