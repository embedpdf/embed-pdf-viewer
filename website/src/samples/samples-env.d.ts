/** Vite's `?worker` import form, used by the samples exactly as consumers
 * write it. The samples compile-check resolves it via this ambient module. */
declare module '@embedpdf/engine/worker-entry?worker' {
  const EngineWorker: new () => Worker;
  export default EngineWorker;
}

/** Vite's `?inline` CSS import — returns the processed stylesheet as a string,
 * emitting nothing. The demo kit injects it into a scoped `<style>`. */
declare module '*.css?inline' {
  const css: string;
  export default css;
}
