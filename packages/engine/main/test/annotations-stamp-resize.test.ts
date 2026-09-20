import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import type { DocumentHandle, Engine, PageRaster } from '@embedpdf/engine-core/runtime';
import { createLocalEngine } from '../src/index';

/** Small independent PDF fixtures: asymmetric vector bands expose wrong crops. */
function pdf(objects: string[]): Uint8Array {
  let text = '%PDF-1.7\n';
  const offsets = [0];
  for (const [index, object] of objects.entries()) {
    offsets.push(text.length);
    text += `${index + 1} 0 obj\n${object}\nendobj\n`;
  }
  const start = text.length;
  text += `xref\n0 ${offsets.length}\n0000000000 65535 f \n`;
  for (const offset of offsets.slice(1)) {
    text += `${String(offset).padStart(10, '0')} 00000 n \n`;
  }
  text += `trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${start}\n%%EOF\n`;
  return new TextEncoder().encode(text);
}

const bands = '1 0 0 rg 0 0 50 100 re f 0 1 0 rg 50 0 100 100 re f 0 0 1 rg 150 0 50 100 re f';
const stream = (dict: string, content: string) =>
  `<< ${dict} /Length ${content.length} >>\nstream\n${content}\nendstream`;

function fixture(
  options: {
    shared?: 'stream' | 'dictionary' | 'states';
    stale?: boolean;
    vertical?: boolean;
    extraContent?: boolean;
  } = {},
): Uint8Array {
  const { shared, stale, vertical, extraContent } = options;
  const size = vertical ? '100 200' : '200 100';
  const content = vertical ? `q 0 1 -1 0 100 0 cm ${bands} Q` : bands;
  const ap = shared === 'dictionary' || shared === 'states' ? '8 0 R' : '<< /N 6 0 R >>';
  return pdf([
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 600 600] /Resources << >> /Contents 4 0 R /Annots [5 0 R ${shared ? '7 0 R' : ''}] >>`,
    stream('', ''),
    `<< /Type /Annot /Subtype /Stamp /Rect [10 10 ${vertical ? '110 210' : '210 110'}] /F 4 /AS /On /AP ${ap} >>`,
    stream(
      `/Type /XObject /Subtype /Form /BBox [0 0 ${size}] /Resources << ${extraContent ? '/XObject << /EPDFWRAP 10 0 R >>' : ''} >> ${stale ? `/EPDFOrigContentRect [0 0 ${size}]` : ''}`,
      extraContent ? `q 1 0 0 1 0 0 cm /EPDFWRAP Do Q 0 0 1 rg 0 0 200 100 re f` : content,
    ),
    `<< /Type /Annot /Subtype /Stamp /Rect [300 10 500 110] /F 4 /AS /On /AP ${ap} >>`,
    shared === 'states' ? '<< /N 9 0 R /R 6 0 R >>' : '<< /N 6 0 R /R 6 0 R >>',
    '<< /On 6 0 R /Off 6 0 R >>',
    stream(`/Type /XObject /Subtype /Form /BBox [0 0 ${size}] /Resources << >>`, content),
  ]);
}

function pixel(raster: PageRaster, x: number, y: number): number[] {
  const index = Math.floor(y * raster.height) * raster.stride + Math.floor(x * raster.width) * 4;
  return [...new Uint8Array(raster.data).slice(index, index + 4)];
}

async function appearance(doc: DocumentHandle, index = 0): Promise<PageRaster> {
  return (await doc.page(3).annotations.renderAppearances()).appearances[index]!.raster;
}

describe('vector stamp resizing (wasm)', () => {
  let engine: Engine;
  beforeAll(async () => {
    engine = await createLocalEngine({ runtime: { prefer: 'wasm' } });
  });
  afterAll(async () => {
    await engine.destroy();
  });

  async function open(bytes: Uint8Array): Promise<DocumentHandle> {
    return engine.open({ kind: 'bytes', id: 'stamp-resize', bytes }, { scope: ['*'] });
  }

  test('download preserves imported stamp rotation with default and rewrite options', async () => {
    // Structural save coverage lives in runtime-src's EPDFStampSaveEmbedderTest.
    // This checks public update/download routing through the WASM engine.
    const original = fixture();
    const doc = await open(original);
    try {
      const page = doc.page(3);
      const ref = (await page.annotations.list()).annotations[0]!.ref;
      await page.annotations.update(ref, {
        subtype: 'stamp',
        rotation: 270,
        unrotatedRect: { left: 80, bottom: 45, right: 140, top: 75 },
        rect: { left: 95, bottom: 30, right: 125, top: 90 },
      });
      // Render the full annotation through the page renderer: appearance
      // thumbnails deliberately remove rotation for the viewer to apply it.
      const render = (document: DocumentHandle) =>
        document.page(3).render.raw({
          includeAnnotations: true,
          target: { kind: 'rect', rect: { left: 0, bottom: -50, right: 520, top: 220 } },
        });
      const live = await render(doc);
      for (const mode of [undefined, 'rewrite'] as const) {
        const saved = await doc.download(mode ? { mode } : undefined);
        if (mode !== 'rewrite') {
          expect(saved.length).toBeGreaterThan(original.length);
          expect(saved.slice(0, original.length)).toEqual(original);
        }
        const reopened = await engine.open(
          { kind: 'bytes', id: 'stamp-reopened', bytes: saved },
          { scope: ['*'] },
        );
        try {
          const updated = (await reopened.page(3).annotations.list()).annotations[0]!;
          expect(updated.subtype).toBe('stamp');
          if (updated.subtype === 'stamp') expect(updated.rotation).toBe(270);
          const raster = await render(reopened);
          expect([raster.width, raster.height]).toEqual([live.width, live.height]);
          expect(Buffer.from(raster.data).equals(Buffer.from(live.data))).toBe(true);
        } finally {
          await reopened.close();
        }
      }
    } finally {
      await doc.close();
    }
  });

  test.each([false, true])(
    'cover centers the crop, vertical=%s, including save/reopen',
    async (vertical) => {
      let doc = await open(fixture({ vertical }));
      try {
        const page = doc.page(3);
        const ref = (await page.annotations.list()).annotations[0]!.ref;
        await page.annotations.update(ref, {
          subtype: 'stamp',
          fit: 'cover',
          rect: { left: 10, bottom: 10, right: 110, top: 110 },
        });
        const verify = async () => {
          const raster = await appearance(doc);
          expect([raster.width, raster.height]).toEqual([100, 100]);
          for (const [x, y] of [
            [0.1, 0.5],
            [0.9, 0.5],
            [0.5, 0.1],
            [0.5, 0.9],
          ]) {
            expect(pixel(raster, x, y)).toEqual([0, 255, 0, 255]);
          }
        };
        await verify();
        const saved = await doc.download();
        await doc.close();
        doc = await open(saved);
        await verify();
      } finally {
        await doc.close();
      }
    },
  );

  test.each(['stream', 'dictionary', 'states'] as const)(
    'resizing preserves a sibling sharing its %s',
    async (shared) => {
      let doc = await open(fixture({ shared }));
      try {
        const page = doc.page(3);
        const ref = (await page.annotations.list()).annotations[0]!.ref;
        const before = await appearance(doc, 1);
        await page.annotations.update(ref, {
          subtype: 'stamp',
          fit: 'contain',
          rect: { left: 10, bottom: 10, right: 110, top: 110 },
        });
        const verify = async () => {
          const sibling = await appearance(doc, 1);
          expect([sibling.width, sibling.height]).toEqual([before.width, before.height]);
          expect(new Uint8Array(sibling.data)).toEqual(new Uint8Array(before.data));
          const resized = await appearance(doc);
          expect([resized.width, resized.height]).toEqual([100, 100]);
          expect(pixel(resized, 0.5, 0.1)[3]).toBe(0);
          expect(pixel(resized, 0.5, 0.5)).toEqual([0, 255, 0, 255]);
        };
        await verify();
        const saved = await doc.download();
        await doc.close();
        doc = await open(saved);
        await verify();
      } finally {
        await doc.close();
      }
    },
  );

  test.each([false, true])(
    'stale metadata preserves the actual artwork, additional operators=%s',
    async (extraContent) => {
      const doc = await open(fixture({ stale: true, extraContent }));
      try {
        const page = doc.page(3);
        const ref = (await page.annotations.list()).annotations[0]!.ref;
        await page.annotations.update(ref, {
          subtype: 'stamp',
          fit: 'fill',
          rect: { left: 10, bottom: 10, right: 110, top: 60 },
        });
        const raster = await appearance(doc);
        expect(pixel(raster, 0.1, 0.5)).toEqual(extraContent ? [0, 0, 255, 255] : [255, 0, 0, 255]);
        expect(pixel(raster, 0.5, 0.5)).toEqual(extraContent ? [0, 0, 255, 255] : [0, 255, 0, 255]);
        expect(pixel(raster, 0.9, 0.5)).toEqual([0, 0, 255, 255]);
      } finally {
        await doc.close();
      }
    },
  );

  test('repeated cover/contain/fill changes preserve artwork after save/reopen', async () => {
    let doc = await open(fixture());
    try {
      const before = await appearance(doc);
      for (let cycle = 0; cycle < 3; cycle++) {
        const page = doc.page(3);
        const ref = (await page.annotations.list()).annotations[0]!.ref;
        for (const fit of ['cover', 'contain', 'fill'] as const) {
          await page.annotations.update(ref, {
            subtype: 'stamp',
            fit,
            rect: { left: 10, bottom: 10, right: 110, top: 110 },
          });
        }
        await page.annotations.update(ref, {
          subtype: 'stamp',
          fit: 'fill',
          rect: { left: 10, bottom: 10, right: 210, top: 110 },
        });
        const saved = await doc.download();
        await doc.close();
        doc = await open(saved);
        expect(new Uint8Array((await appearance(doc)).data)).toEqual(new Uint8Array(before.data));
      }
    } finally {
      await doc.close();
    }
  });
});
