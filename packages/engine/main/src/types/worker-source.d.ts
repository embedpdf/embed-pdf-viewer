/**
 * The inline worker source module — a BUILD ARTIFACT (see
 * scripts/build-workers.mjs) exporting the self-contained pdfium worker as a
 * string, published at `@embedpdf/engine/worker-source`. This ambient
 * declaration lets the package typecheck before its own build has run; the
 * built subpath ships its own .d.ts with the same shape.
 */
declare module '@embedpdf/engine/worker-source' {
  const source: string;
  export default source;
}
