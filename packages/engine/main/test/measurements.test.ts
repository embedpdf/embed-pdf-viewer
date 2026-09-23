import { readFile } from 'node:fs/promises';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import {
  EngineErrorCode,
  measureFromKnownLength,
  measurementReadout,
  type Engine,
  type LineDraft,
  type PolygonDraft,
  toPageRef,
} from '@embedpdf/engine-core/runtime';
import { createLocalEngine } from '../src/index';

function pdf(extraPage = '', annotations: string | string[] = ''): Uint8Array {
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    `<< /Type /Page /Parent 2 0 R /MediaBox [-20 -40 592 752] /Resources << >> ${extraPage} >>`,
    ...(Array.isArray(annotations) ? annotations : annotations ? [annotations] : []),
  ];
  let text = '%PDF-1.7\n';
  const offsets = [0];
  objects.forEach((obj, i) => {
    offsets.push(text.length);
    text += `${i + 1} 0 obj\n${obj}\nendobj\n`;
  });
  const start = text.length;
  text +=
    `xref\n0 ${offsets.length}\n0000000000 65535 f \n` +
    offsets
      .slice(1)
      .map((o) => `${String(o).padStart(10, '0')} 00000 n \n`)
      .join('');
  text += `trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${start}\n%%EOF\n`;
  return new TextEncoder().encode(text);
}
const scale = measureFromKnownLength(100, { value: 3, unit: 'm' });
const line = (): LineDraft => ({
  subtype: 'line',
  intent: 'LineDimension',
  measure: scale,
  contents: 'wrong',
  rect: { left: 98, bottom: 98, right: 202, top: 102 },
  linePoints: { start: { x: 100, y: 100 }, end: { x: 200, y: 100 } },
  caption: { enabled: true, position: 'inline' },
  leader: { length: 12, extension: 5 },
});

describe.each(['wasm', 'native'] as const)('measurement engine (%s)', (prefer) => {
  let engine: Engine;
  beforeAll(async () => {
    engine = await createLocalEngine({ runtime: { prefer } });
  });
  afterAll(async () => {
    await engine?.destroy();
  });
  const open = (bytes = pdf()) =>
    engine.open({ kind: 'bytes', id: `measurement-${prefer}`, bytes }, { scope: ['*'] });

  test('derived contents overrides clients, style preserves imported formatting, caption patches preserve placement', async () => {
    const doc = await open();
    try {
      const page = doc.page(toPageRef(3)),
        created = (await page.annotations.create(line())).created;
      expect(created).toMatchObject({
        contents: '3 m',
        intent: 'LineDimension',
        caption: { enabled: true },
        leader: { length: 12 },
      });
      const wrong = await page.annotations.update(created.ref, {
        subtype: 'line',
        contents: '999 m',
      });
      expect(wrong.updated.contents).toBe('3 m');
      expect(wrong.appearance).toEqual({ action: 'preserved', changed: false });
      const moved = await page.annotations.update(created.ref, {
        subtype: 'line',
        linePoints: { start: { x: 100, y: 100 }, end: { x: 300, y: 100 } },
      });
      expect(moved.updated.contents).toBe('6 m');
      expect(moved.appearance.changed).toBe(true);
      await page.annotations.update(created.ref, {
        subtype: 'line',
        caption: { offset: { along: 12, perpendicular: 25 }, position: 'top' },
      });
      const hidden = await page.annotations.update(created.ref, {
        subtype: 'line',
        caption: { enabled: false },
      });
      expect(hidden.updated).toMatchObject({
        caption: { enabled: false, position: 'top', offset: { along: 12, perpendicular: 25 } },
        contents: '6 m',
      });
      const reset = await page.annotations.update(created.ref, {
        subtype: 'line',
        caption: { enabled: true, offset: null },
      });
      expect(reset.updated).toMatchObject({ caption: { enabled: true, position: 'top' } });
      expect(reset.updated.subtype === 'line' && reset.updated.caption?.offset).toBeUndefined();
    } finally {
      await doc.close();
    }
  });
  test('manual area center moves with rigid geometry, stays fixed on vertex edits, and (0,0) survives', async () => {
    const doc = await open();
    try {
      const page = doc.page(toPageRef(3));
      const draft: PolygonDraft = {
        subtype: 'polygon',
        intent: 'PolygonDimension',
        measure: scale,
        rect: { left: 0, bottom: 0, right: 100, top: 100 },
        vertices: [
          { x: 0, y: 0 },
          { x: 100, y: 0 },
          { x: 100, y: 100 },
          { x: 0, y: 100 },
        ],
        caption: { enabled: true, center: { x: 0, y: 0 } },
      };
      const a = (await page.annotations.create(draft)).created;
      expect(a.contents).toBe('9 m²');
      const moved = await page.annotations.update(a.ref, {
        subtype: 'polygon',
        rect: {
          left: a.rect.left + 20,
          right: a.rect.right + 20,
          top: a.rect.top + 30,
          bottom: a.rect.bottom + 30,
        },
        vertices: draft.vertices.map((p) => ({ x: p.x + 20, y: p.y + 30 })),
      });
      expect(moved.updated).toMatchObject({
        caption: { center: { x: 20, y: 30 } },
        contents: '9 m²',
      });
      expect(moved.appearance.action).toBe('preserved');
      const edit = await page.annotations.update(a.ref, {
        subtype: 'polygon',
        vertices: [
          { x: 20, y: 30 },
          { x: 130, y: 30 },
          { x: 120, y: 130 },
          { x: 20, y: 130 },
        ],
      });
      expect(edit.updated).toMatchObject({ caption: { center: { x: 20, y: 30 } } });
      const reset = await page.annotations.update(a.ref, {
        subtype: 'polygon',
        caption: { center: null },
      });
      expect(reset.updated.subtype === 'polygon' && reset.updated.caption?.center).toBeUndefined();
    } finally {
      await doc.close();
    }
  });
  test('save/reopen and layer round trips include all three kinds and full-page calibration', async () => {
    const base = pdf(
      '/VP [<< /Type /Viewport /Name (Foreign) /BBox [0 0 10 10] /Measure << /Subtype /GEO /Vendor (keep) >> /PtData << /Keep 1 >> >>]',
    );
    let doc = await engine.open(
      { kind: 'layerBytes', id: 'measure-layer', baseBytes: base, layer: { kind: 'fresh' } },
      { scope: ['*'] },
    );
    try {
      const p = doc.page(toPageRef(3));
      await p.measure!.setScale(scale);
      await p.annotations.create(line());
      await p.annotations.create({
        subtype: 'polyline',
        intent: 'PolyLineDimension',
        measure: scale,
        vertices: [
          { x: 0, y: 0 },
          { x: 100, y: 0 },
          { x: 100, y: 100 },
        ],
        rect: { left: 0, bottom: 0, right: 100, top: 100 },
        caption: { enabled: true, center: { x: 0, y: 0 } },
      });
      await p.annotations.create({
        subtype: 'polygon',
        intent: 'PolygonDimension',
        measure: scale,
        vertices: [
          { x: 0, y: 0 },
          { x: 100, y: 0 },
          { x: 100, y: 100 },
        ],
        rect: { left: 0, bottom: 0, right: 100, top: 100 },
        caption: { enabled: true },
      });
      const artifact = await doc.downloadLayer!();
      await doc.close();
      doc = await engine.open(
        {
          kind: 'layerBytes',
          id: 'measure-reopen',
          baseBytes: base,
          layer: { kind: 'artifact', bytes: artifact },
        },
        { scope: ['*'] },
      );
      const annotations = (await doc.page(toPageRef(3)).annotations.list()).annotations;
      expect(annotations.map((a) => a.contents)).toEqual(['3 m', '6 m', '4.5 m²']);
      expect(annotations[1]).toMatchObject({ caption: { center: { x: 0, y: 0 } } });
      const viewports = await doc.page(toPageRef(3)).measure!.viewports();
      expect(viewports).toHaveLength(2);
      expect(viewports[1]).toMatchObject({
        owned: true,
        bbox: { left: -20, bottom: -40, right: 592, top: 752 },
      });
      await doc.page(toPageRef(3)).measure!.setScale(null);
      expect(await doc.page(toPageRef(3)).measure!.viewports()).toEqual([viewports[0]]);
    } finally {
      await doc.close();
    }
  });
  test('float32 preview matches commit, reopen and style-only update', async () => {
    let doc = await open();
    try {
      const draft = {
        ...line(),
        measure: measureFromKnownLength(1, { value: 1.00000001, unit: 'm' }),
        linePoints: { start: { x: 0, y: 0 }, end: { x: 3.4450000001, y: 0 } },
      };
      const expected = measurementReadout(draft);
      const created = (await doc.page(toPageRef(3)).annotations.create(draft)).created;
      expect(created.contents).toBe('label' in expected && expected.label);
      const saved = await doc.download();
      await doc.close();
      doc = await open(saved);
      const a = (await doc.page(toPageRef(3)).annotations.list()).annotations[0];
      expect(a.contents).toBe(created.contents);
      const changed = await doc
        .page(toPageRef(3))
        .annotations.update(a.ref, { subtype: 'line', color: { r: 0, g: 0, b: 255 } });
      expect(changed.updated.contents).toBe(created.contents);
    } finally {
      await doc.close();
    }
  });
  test('invalid measure fails before geometry or label writes, unavailable scales keep contents', async () => {
    const doc = await open();
    try {
      const page = doc.page(toPageRef(3)),
        a = (await page.annotations.create(line())).created;
      await expect(
        page.annotations.update(a.ref, {
          subtype: 'line',
          contents: 'corrupt',
          measure: { ...scale, x: [{ unit: 'm', conversion: 0 }] },
        }),
      ).rejects.toMatchObject({ code: EngineErrorCode.InvalidArg });
      await expect(
        page.annotations.update(a.ref, {
          subtype: 'line',
          contents: 'corrupt',
          caption: 'invalid',
        } as never),
      ).rejects.toMatchObject({ code: EngineErrorCode.InvalidArg });
      await expect(page.measure!.setScale(undefined as never)).rejects.toMatchObject({
        code: EngineErrorCode.InvalidArg,
      });
      expect(await page.measure!.viewports()).toEqual([]);
      expect((await page.annotations.list()).annotations[0].contents).toBe('3 m');
      const unavailable = await page.annotations.update(a.ref, {
        subtype: 'line',
        measure: { ...scale, y: [{ unit: 'm', conversion: 2 }] },
      });
      expect(unavailable.updated.contents).toBe('3 m');
      expect(measurementReadout(unavailable.updated)).toEqual({ unavailable: 'no-scale' });
    } finally {
      await doc.close();
    }
  });
  test.each(['metric', 'imperial'])(
    'Acrobat %s import keeps stored labels and does not opt shapes into captions',
    async (unit) => {
      const bytes = new Uint8Array(
        await readFile(new URL(`./fixtures/measure-acrobat-${unit}.pdf`, import.meta.url)),
      );
      const doc = await open(bytes);
      try {
        const pageObjectNumber = (await doc.pages.list()).pages[0].ref.pageObjectNumber;
        const annotations = (await doc.page(toPageRef(pageObjectNumber)).annotations.list())
          .annotations;
        const dimensions = annotations.filter((a) =>
          ['line', 'polyline', 'polygon'].includes(a.subtype),
        );
        expect(dimensions).toHaveLength(unit === 'metric' ? 11 : 4);
        for (const a of dimensions) {
          const readout = measurementReadout(a);
          expect(readout).toHaveProperty('label');
          // Acrobat can retain trailing zeros when /FD is absent. Numeric
          // agreement and preservation of its exact saved text are separate.
          if ('label' in readout)
            expect(Number.parseFloat(readout.label)).toBe(Number.parseFloat(a.contents!));
          if (a.subtype === 'polygon' || a.subtype === 'polyline')
            expect(a.caption).toBeUndefined();
          const updated = await doc.page(toPageRef(pageObjectNumber)).annotations.update(a.ref, {
            subtype: a.subtype,
            color: { r: 0, g: 0, b: 255 },
          } as never);
          expect(updated.updated.contents).toBe(a.contents);
        }
      } finally {
        await doc.close();
      }
    },
  );
  test('shared and foreign measures survive edits, malformed scales remain unavailable', async () => {
    const annotation = (measure: string) =>
      `<< /Type /Annot /Subtype /Line /IT /LineDimension /Rect [0 0 100 100] /L [0 0 100 0] /Contents (imported) /Measure ${measure} >>`;
    const bytes = pdf('/Annots [4 0 R 5 0 R 7 0 R 8 0 R]', [
      annotation('6 0 R'),
      annotation('6 0 R'),
      '<< /Type /Measure /Subtype /RL /X [<< /U (m) /C 1 >>] /D [<< /U (m) /C 1 >>] /A [] >>',
      annotation('<< /Subtype /GEO /Vendor (preserve) >>'),
      annotation('<< /Subtype /RL /X [<< /U (m) >>] /D [<< /U (m) /C 1 >>] /A [] >>'),
    ]);
    const doc = await open(bytes);
    try {
      const page = doc.page(toPageRef(3)),
        before = (await page.annotations.list()).annotations;
      expect(measurementReadout(before[3])).toEqual({ unavailable: 'no-scale' });
      await page.annotations.update(before[0].ref, { subtype: 'line', measure: scale });
      await expect(
        page.annotations.update(before[2].ref, {
          subtype: 'line',
          contents: 'corrupt',
          measure: scale,
        }),
      ).rejects.toMatchObject({ code: EngineErrorCode.InvalidArg });
      const after = (await page.annotations.list()).annotations;
      expect(after[0].contents).toBe('3 m');
      expect(after[1]).toEqual(before[1]);
      expect(after[2]).toEqual(before[2]);
      await page.annotations.update(before[3].ref, {
        subtype: 'line',
        linePoints: { start: { x: 0, y: 0 }, end: { x: 200, y: 0 } },
      });
      expect((await page.annotations.list()).annotations[3].contents).toBe('imported');
    } finally {
      await doc.close();
    }
  });
  test('manual shape center follows rotation and an explicit center wins', async () => {
    const doc = await open();
    try {
      const page = doc.page(toPageRef(3));
      const vertices = [
        { x: 10, y: 10 },
        { x: 110, y: 10 },
        { x: 110, y: 110 },
      ];
      const a = (
        await page.annotations.create({
          subtype: 'polygon',
          intent: 'PolygonDimension',
          measure: scale,
          rect: { left: 10, bottom: 10, right: 110, top: 110 },
          vertices,
          caption: { enabled: true, center: { x: 90, y: 20 } },
        })
      ).created;
      const rotated = vertices.map((p) => ({ x: 200 - p.y, y: p.x }));
      const result = await page.annotations.update(a.ref, {
        subtype: 'polygon',
        vertices: rotated,
        caption: { enabled: false },
      });
      expect(result.updated).toMatchObject({
        contents: '4.5 m²',
        caption: { enabled: false, center: { x: 180, y: 90 } },
      });
      const explicit = await page.annotations.update(a.ref, {
        subtype: 'polygon',
        vertices,
        caption: { center: { x: 0, y: 0 } },
      });
      expect(explicit.updated).toMatchObject({ caption: { center: { x: 0, y: 0 } } });
    } finally {
      await doc.close();
    }
  });
});
