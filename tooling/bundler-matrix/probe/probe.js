/**
 * The bundler-matrix probe. Same code in every app; the app is only the
 * toolchain around it. Zero configuration by design: `localEngine()` with
 * nothing passed, the built-in stamp library with nothing passed. Whatever a
 * toolchain does with the worker, the wasm, and lazy chunks shows up here as
 * a result, a timing, and the list of origins the page talked to.
 */
import { localEngine } from '@embedpdf/engine';
import { loadDefaultLibrary } from '@embedpdf/default-stamps/library';

/** A one-page PDF built in memory so the probe itself makes no request. */
function tinyPdf() {
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 100] >>',
  ];
  let body = '%PDF-1.7\n';
  const offsets = [];
  objects.forEach((object, index) => {
    offsets.push(body.length);
    body += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = body.length;
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) body += `${String(offset).padStart(10, '0')} 00000 n \n`;
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new TextEncoder().encode(body);
}

export const runProbe = (root) => runProbeWith(root, localEngine, 'default');

export async function runProbeWith(root, createEngine, entry) {
  const result = { ok: false, entry, steps: {}, errors: [], ms: 0 };
  const started = performance.now();
  const step = async (name, fn) => {
    const t = performance.now();
    const value = await fn();
    result.steps[name] = { ...value, ms: Math.round(performance.now() - t) };
  };
  try {
    // Variants that test a DOCUMENTED opt-in (the Angular fast path) declare
    // it in the page; the default is still `localEngine()` with nothing.
    const assetsUrl = document.querySelector('meta[name="embedpdf-assets"]')?.content;
    result.config = assetsUrl ? { assetsUrl } : 'none';
    const engine = createEngine(assetsUrl ? { assetsUrl } : undefined);
    await step('engine', async () => {
      const doc = await engine.open(
        { kind: 'bytes', id: 'probe', bytes: tinyPdf() },
        { scope: ['*'] },
      );
      const layout = await doc.pages.list();
      const raster = await doc
        .page(layout.pages[0].pageObjectNumber)
        .render.raw({ viewport: { kind: 'width', width: 64 } });
      await doc.close();
      return { pages: layout.pageCount, width: raster.width, height: raster.height };
    });
    await engine.destroy();
    await step('stamps', async () => {
      const bytes = await loadDefaultLibrary('en');
      return { bytes: bytes.byteLength, isPdf: bytes[0] === 0x25 && bytes[1] === 0x50 };
    });
    result.ok = true;
  } catch (error) {
    result.errors.push(String(error && error.stack ? error.stack : error));
  }
  result.ms = Math.round(performance.now() - started);
  root.textContent = JSON.stringify(result);
  root.setAttribute('data-done', '1');
  window.__probe = result;
  return result;
}
