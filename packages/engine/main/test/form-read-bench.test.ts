/**
 * How long the form read takes on a large form: 2,000 pages, each with one
 * text field's widget and one comment, so both families are on every page.
 * Env-gated (`EPDF_FORM_BENCH=1`); prints the times and asserts only that the
 * read finds every field and widget.
 */
import { describe, expect, test } from 'vitest';
import { pdfOf } from '@embedpdf/engine-core/conformance';

import { createLocalEngine } from '../src/index';

const ENABLED = !!process.env.EPDF_FORM_BENCH;
const PAGES = 2000;

/** Objects 1–2 are the catalog and the page tree; each page brings four objects. */
function largeForm(pages: number): Uint8Array {
  const pageObject = (i: number) => 3 + 4 * i;
  const objects: string[] = [
    `<< /Type /Catalog /Pages 2 0 R /AcroForm << /Fields [${Array.from(
      { length: pages },
      (_, i) => `${pageObject(i) + 1} 0 R`,
    ).join(' ')}] /DA (/Helv 0 Tf 0 g) >> >>`,
    `<< /Type /Pages /Kids [${Array.from({ length: pages }, (_, i) => `${pageObject(i)} 0 R`).join(
      ' ',
    )}] /Count ${pages} >>`,
  ];
  for (let i = 0; i < pages; i++) {
    const page = pageObject(i);
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 300] /Annots [${page + 1} 0 R ${page + 2} 0 R] >>`,
      `<< /Type /Annot /Subtype /Widget /FT /Tx /T (field${i}) /V (value ${i}) /Rect [20 20 120 40] /P ${page} 0 R >>`,
      `<< /Type /Annot /Subtype /Text /Rect [200 200 220 220] /Contents (note ${i}) /P ${page} 0 R >>`,
      '<< /Length 0 >>\nstream\n\nendstream',
    );
  }
  return pdfOf(objects);
}

describe.skipIf(!ENABLED).each(['wasm', 'native'] as const)('form read on %s', (prefer) => {
  test(`${PAGES} pages, one field and one comment each`, async () => {
    const engine = await createLocalEngine({ runtime: { prefer } });
    const doc = await engine.open({
      kind: 'bytes',
      id: `form-bench-${prefer}`,
      bytes: largeForm(PAGES),
    });
    try {
      const times: number[] = [];
      let fields = 0;
      let widgets = 0;
      for (let run = 0; run < 4; run++) {
        const started = performance.now();
        const form = await doc.forms.list();
        times.push(performance.now() - started);
        fields = form.fields.length;
        widgets = form.widgets.length;
      }
      console.log(
        `[form read, ${prefer}] ${PAGES} pages: cold ${times[0]!.toFixed(1)} ms, warm ${times
          .slice(1)
          .map((t) => t.toFixed(1))
          .join(' / ')} ms`,
      );
      expect(fields).toBe(PAGES);
      expect(widgets).toBe(PAGES);
    } finally {
      await doc.close();
      await engine.destroy();
    }
  }, 120_000);
});
