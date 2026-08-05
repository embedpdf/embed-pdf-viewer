/**
 * The image-encoder worker, as source text — ONE definition serving both
 * deliveries so they can never drift:
 *
 *   - at runtime, `BrowserImageEncoder` spawns it from a blob URL (default);
 *   - at build time, `scripts/build-workers.mjs` writes it verbatim to
 *     `workers/encoder-worker.js`, the same-origin static file strict-CSP
 *     users point `encoderWorker` at.
 *
 * Deliberately dependency-free classic-worker code: it must run identically
 * as a blob and as a plain file.
 */
export const encoderWorkerSource = `
self.onmessage = async (event) => {
  const { id, raster, format, quality } = event.data;
  try {
    if (typeof OffscreenCanvas === 'undefined') {
      throw new Error('OffscreenCanvas is not available in this worker');
    }
    const bytes = raster.data;
    const image = new ImageData(new Uint8ClampedArray(bytes), raster.width, raster.height);
    const canvas = new OffscreenCanvas(raster.width, raster.height);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2D canvas context is unavailable');
    ctx.putImageData(image, 0, 0);
    const blob = await canvas.convertToBlob({ type: 'image/' + format, quality });
    const encoded = await blob.arrayBuffer();
    self.postMessage({ id, ok: true, bytes: encoded }, [encoded]);
  } catch (err) {
    self.postMessage({ id, ok: false, error: err && err.message ? err.message : String(err) });
  }
};
`;
