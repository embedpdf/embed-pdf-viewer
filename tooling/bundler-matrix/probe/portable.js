/**
 * The same probe, importing `localEngine` from `@embedpdf/engine/portable`:
 * the wasm travels through the module graph as a lazy chunk instead of
 * being emitted as an asset. The row for toolchains that cannot do the latter.
 */
import { localEngine } from '@embedpdf/engine/portable';
import { runProbeWith } from './probe.js';

export const runProbe = (root) => runProbeWith(root, localEngine, 'portable');
