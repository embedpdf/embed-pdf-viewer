/**
 * @embedpdf/viewer/portable — the npm door for toolchains that can't emit the
 * engine's files (`dist/portable.js`).
 *
 * ```ts
 * import EmbedPDF from '@embedpdf/viewer/portable';
 * EmbedPDF.init({ target: '#viewer', src: '/report.pdf' });
 * ```
 *
 * The npm door with the engine's portable build in place of its default one.
 * Plain esbuild leaves `new URL('…', import.meta.url)` as it is, so it emits
 * neither `embedpdf.wasm` nor the engine's worker files; the portable build
 * carries the wasm as a lazy chunk of the app's own build and starts both
 * workers from blob: URLs (`worker-src blob:`). The surface and the config are
 * the npm door's, `engine.worker` and `engine.encoderWorker` included.
 */
import { localEngine } from '@embedpdf/engine/portable';

import { registerLocalEngine } from '../local/register';

registerLocalEngine(localEngine);

export * from '../local/surface';
export { default } from '../local/surface';
