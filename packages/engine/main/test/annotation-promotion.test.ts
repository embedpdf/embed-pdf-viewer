/**
 * A write that moves entries of a page's /Annots (a delete, a reorder)
 * first makes the page's inline annotations objects, in place. Every other
 * annotation keeps what it shows under the name it had (an inline one its
 * `baseIndex`), and the layer saves and reopens to the same page.
 */
import { describe, expect, test } from 'vitest';
import type { Annotation, DocumentHandle, Engine, PageRef } from '@embedpdf/engine-core/runtime';
import { createLocalEngine } from '../src/index';

/**
 * One page whose /Annots holds inline annotations around an indirect one:
 * removing or moving an entry would shift the inline ones after it.
 */
function inlineAnnotationsPdf(): Uint8Array {
  const square = (x: number, label: string) =>
    `<< /Type /Annot /Subtype /Square /Rect [${x} 10 ${x + 40} 50] /C [1 0 0] /Contents (${label}) >>`;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 300] /Annots [${square(10, 'first')} 4 0 R ${square(110, 'third')} ${square(160, 'fourth')}] >>`,
    '<< /Type /Annot /Subtype /Circle /Rect [60 60 100 100] /C [0 0 1] /Contents (second) >>',
  ];
  let pdf = '%PDF-1.7\n';
  const offsets = objects.map((body, i) => {
    const offset = pdf.length;
    pdf += `${i + 1} 0 obj\n${body}\nendobj\n`;
    return offset;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new TextEncoder().encode(pdf);
}

/** An annotation as a read gives it, apart from its stacking order. */
const shown = ({ index: _index, ...rest }: Annotation) => rest;

describe.each(['wasm', 'native'] as const)(
  'inline annotations are promoted first (%s runtime)',
  (prefer) => {
    async function open(id: string) {
      const engine = await createLocalEngine({ runtime: { prefer } });
      const baseBytes = inlineAnnotationsPdf();
      const doc = await engine.open(
        { kind: 'layerBytes', id, baseBytes, layer: { kind: 'fresh' } },
        { scope: ['*'] },
      );
      const page = (await doc.pages.list()).pages[0]!.ref;
      const before = (await doc.page(page).annotations.list()).annotations;
      expect(before.map((a) => a.ref.kind)).toEqual([
        'baseIndex',
        'objectNumber',
        'baseIndex',
        'baseIndex',
      ]);
      return { engine, baseBytes, doc, page, before };
    }

    async function reopened(
      engine: Engine,
      baseBytes: Uint8Array,
      doc: DocumentHandle,
      page: PageRef,
    ) {
      const bytes = await doc.downloadLayer();
      const again = await engine.open(
        {
          kind: 'layerBytes',
          id: `${doc.id}-again`,
          baseBytes,
          layer: { kind: 'artifact', bytes },
        },
        { scope: ['*'] },
      );
      return (await again.page(page).annotations.list()).annotations;
    }

    test('a delete keeps every other annotation as it was', async () => {
      const { engine, baseBytes, doc, page, before } = await open(`promote-delete-${prefer}`);
      try {
        const victim = before[1]!;

        await doc.page(page).annotations.delete(victim.ref);

        const after = (await doc.page(page).annotations.list()).annotations;
        const kept = before.filter((a) => a !== victim).map(shown);
        expect(after.map(shown)).toEqual(kept);
        expect((await reopened(engine, baseBytes, doc, page)).map(shown)).toEqual(kept);
      } finally {
        await engine.destroy();
      }
    });

    test('a reorder keeps every annotation as it was, in its new place', async () => {
      const { engine, baseBytes, doc, page, before } = await open(`promote-move-${prefer}`);
      try {
        const last = before.at(-1)!;

        await doc.page(page).annotations.move([last.ref], 0);

        const after = (await doc.page(page).annotations.list()).annotations;
        const reordered = [last, ...before.slice(0, -1)].map(shown);
        expect(after.map(shown)).toEqual(reordered);
        expect((await reopened(engine, baseBytes, doc, page)).map(shown)).toEqual(reordered);
      } finally {
        await engine.destroy();
      }
    });
  },
);
