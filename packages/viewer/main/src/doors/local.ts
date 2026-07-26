/**
 * @embedpdf/viewer — the npm door (`dist/index.js`).
 *
 * ```ts
 * import EmbedPDF from '@embedpdf/viewer';
 * EmbedPDF.init({ target: '#viewer', src: '/report.pdf' });
 * ```
 *
 * The kernel plus ONE side effect: the built-in local PDFium engine registered
 * as the element's default, so `init()` needs no `engine:`. Because that engine
 * IS in this graph, this door's `engine` field is optional and also accepts its
 * plain-data options bag (self-hosted wasm, strict-CSP worker URLs). Builds
 * that always inject their own engine import `@embedpdf/viewer/core` instead
 * and never pull the local engine in.
 *
 * No wasm default is passed: inside an app bundler this artifact has no
 * reliable location, so the engine's own sibling-first resolution applies.
 */
import { registerLocalEngine } from '../local/register';

registerLocalEngine();

export * from '../local/surface';
export { default } from '../local/surface';
