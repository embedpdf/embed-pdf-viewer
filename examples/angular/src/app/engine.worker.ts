/// <reference lib="webworker" />
/**
 * Worker shell: the engine package's worker-entry does everything (creates the
 * WASM runtime in this thread, wires postMessage). This file exists so the
 * bundler has a local `new URL('./engine.worker', import.meta.url)` target.
 */
import '@embedpdf/engine/worker-entry';
