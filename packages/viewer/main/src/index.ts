/**
 * @embedpdf/viewer — the vanilla entry.
 *
 * ```html
 * <div id="viewer" style="height:100vh"></div>
 * <script type="module">
 *   import EmbedPDF from 'https://cdn.embedpdf.com/v3/embedpdf.js';
 *   EmbedPDF.init({ target: '#viewer', src: '/report.pdf' });
 * </script>
 * ```
 *
 * The engine-agnostic `./core` plus ONE side effect: the built-in local
 * PDFium engine registered as the default, so `init()` needs no `engine:`.
 * Builds that always inject their own engine import `@embedpdf/viewer/core`
 * instead and never pull the local engine into their graph.
 */
import './local-default';
import EmbedPDF from './core';

export * from './core';

// The LOCAL engine's vocabulary lives on this entry (not ./core): the type
// for the `engine:` options bag, so a self-hosting or strict-CSP config can
// be typed without importing the engine package.
export type { LocalEngineConfig } from './config';
export type { LocalEngineRecipeOptions } from '@embedpdf/engine';

export default EmbedPDF;
