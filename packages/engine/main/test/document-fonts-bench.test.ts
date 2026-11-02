/**
 * What a document's fonts cost on a large document: 5,000 pages sharing a
 * Helvetica resource, every tenth with a Times of its own. The first list
 * walks every page; after it, every write says whether it changed the fonts,
 * and a list after a write walks only the pages the write touched (the
 * fork's index; its walk counts are asserted in `epdf_font_embeddertest`).
 * Env-gated (`EPDF_FONTS_BENCH=1`); prints the times and asserts only what
 * the lists hold.
 */
import { describe, expect, test } from 'vitest';
import { pdfOf } from '@embedpdf/engine-core/conformance';

import { createLocalEngine } from '../src/index';

const ENABLED = !!process.env.EPDF_FONTS_BENCH;
const PAGES = 5000;
const EDITS = 50;

/**
 * Objects 1–4 are the catalog, the page tree, the shared resources and
 * Helvetica; each page brings itself and a content stream, and every tenth a
 * Times of its own.
 */
function largeDocument(pages: number): Uint8Array {
  const objects: string[] = ['', '', '<< /Font << /F1 4 0 R >> >>'];
  objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  const kids: number[] = [];
  for (let i = 0; i < pages; i++) {
    const page = objects.length + 1;
    kids.push(page);
    const ownFont = i % 10 === 0;
    const resources = ownFont ? `<< /Font << /F1 4 0 R /F2 ${page + 2} 0 R >> >>` : '3 0 R';
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 300] /Resources ${resources} /Contents ${page + 1} 0 R >>`,
      '<< /Length 0 >>\nstream\n\nendstream',
    );
    if (ownFont) objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Times-Roman >>');
  }
  objects[0] = '<< /Type /Catalog /Pages 2 0 R >>';
  objects[1] = `<< /Type /Pages /Kids [${kids.map((kid) => `${kid} 0 R`).join(' ')}] /Count ${pages} >>`;
  return pdfOf(objects);
}

const median = (times: readonly number[]) =>
  [...times].sort((left, right) => left - right)[Math.floor(times.length / 2)]!;

describe.skipIf(!ENABLED).each(['wasm', 'native'] as const)('document fonts on %s', (prefer) => {
  test(`${PAGES} pages: the first list, then ${EDITS} edits in a row`, async () => {
    const engine = await createLocalEngine({ runtime: { prefer } });
    const doc = await engine.open({
      kind: 'bytes',
      id: `fonts-bench-${prefer}`,
      bytes: largeDocument(PAGES),
    });
    try {
      const pages = (await doc.pages.list()).pages;
      let started = performance.now();
      const first = await doc.fonts.list();
      const firstList = performance.now() - started;
      expect(first.fonts.some((font) => font.familyName === 'Helvetica')).toBe(true);

      const writes: number[] = [];
      const lists: number[] = [];
      for (let edit = 0; edit < EDITS; edit++) {
        const page = pages[(edit * 97) % PAGES]!.ref;
        started = performance.now();
        await doc.page(page).annotations.create({
          subtype: 'square',
          rect: { x: 10, y: 10, width: 20, height: 20 },
        });
        writes.push(performance.now() - started);
        started = performance.now();
        await doc.fonts.list();
        lists.push(performance.now() - started);
      }
      console.log(
        `[document fonts, ${prefer}] ${PAGES} pages: first list ${firstList.toFixed(1)} ms; ` +
          `${EDITS} edits: write ${median(writes).toFixed(1)} ms, list after it ` +
          `${median(lists).toFixed(1)} ms (medians)`,
      );
    } finally {
      await doc.close();
      await engine.destroy();
    }
  }, 300_000);
});
