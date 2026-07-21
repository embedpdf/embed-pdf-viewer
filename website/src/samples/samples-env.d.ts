/** Vite's `?worker` import form, used by the samples exactly as consumers
 * write it. The samples compile-check resolves it via this ambient module. */
declare module '@embedpdf/engine/worker-entry?worker' {
  const EngineWorker: new () => Worker;
  export default EngineWorker;
}
