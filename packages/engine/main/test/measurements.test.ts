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
  intent: 'line-dimension',
  measure: scale,
  contents: 'wrong',
  rect: { left: 98, bottom: 98, right: 202, top: 102 },
  linePoints: { start: { x: 100, y: 100 }, end: { x: 200, y: 100 } },
  captionEnabled: true,
  captionPosition: 'inline',
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
        created = (await page.annotations.create(line())).annotation;
      expect(created).toMatchObject({
        contents: '3.00 m',
        intent: 'line-dimension',
        captionEnabled: true,
        leader: { length: 12 },
      });
      const wrong = await page.annotations.update(created.ref, {
        subtype: 'line',
        contents: '999 m',
      });
      expect(wrong.annotation.contents).toBe('3.00 m');
      expect(wrong.appearance).toEqual({ action: 'preserved', changed: false });
      const moved = await page.annotations.update(created.ref, {
        subtype: 'line',
        linePoints: { start: { x: 100, y: 100 }, end: { x: 300, y: 100 } },
      });
      expect(moved.annotation.contents).toBe('6.00 m');
      expect(moved.appearance.changed).toBe(true);
      await page.annotations.update(created.ref, {
        subtype: 'line',
        captionOffset: { along: 12, perpendicular: 25 },
        captionPosition: 'top',
      });
      const hidden = await page.annotations.update(created.ref, {
        subtype: 'line',
        captionEnabled: false,
      });
      expect(hidden.annotation).toMatchObject({
        captionEnabled: false,
        captionPosition: 'top',
        captionOffset: { along: 12, perpendicular: 25 },
        contents: '6.00 m',
      });
      const reset = await page.annotations.update(created.ref, {
        subtype: 'line',
        captionEnabled: true,
        captionOffset: null,
      });
      expect(reset.annotation).toMatchObject({ captionEnabled: true, captionPosition: 'top' });
      expect(reset.annotation.subtype === 'line' && reset.annotation.captionOffset).toBe(null);
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
        intent: 'polygon-dimension',
        measure: scale,
        rect: { left: 0, bottom: 0, right: 100, top: 100 },
        vertices: [
          { x: 0, y: 0 },
          { x: 100, y: 0 },
          { x: 100, y: 100 },
          { x: 0, y: 100 },
        ],
        captionEnabled: true,
        captionCenter: { x: 0, y: 0 },
      };
      const a = (await page.annotations.create(draft)).annotation;
      expect(a.contents).toBe('9.00 m²');
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
      expect(moved.annotation).toMatchObject({
        captionCenter: { x: 20, y: 30 },
        contents: '9.00 m²',
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
      expect(edit.annotation).toMatchObject({ captionCenter: { x: 20, y: 30 } });
      const reset = await page.annotations.update(a.ref, {
        subtype: 'polygon',
        captionCenter: null,
      });
      expect(reset.annotation.subtype === 'polygon' && reset.annotation.captionCenter).toBe(null);
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
        intent: 'polyline-dimension',
        measure: scale,
        vertices: [
          { x: 0, y: 0 },
          { x: 100, y: 0 },
          { x: 100, y: 100 },
        ],
        rect: { left: 0, bottom: 0, right: 100, top: 100 },
        captionEnabled: true,
        captionCenter: { x: 0, y: 0 },
      });
      await p.annotations.create({
        subtype: 'polygon',
        intent: 'polygon-dimension',
        measure: scale,
        vertices: [
          { x: 0, y: 0 },
          { x: 100, y: 0 },
          { x: 100, y: 100 },
        ],
        rect: { left: 0, bottom: 0, right: 100, top: 100 },
        captionEnabled: true,
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
      expect(annotations.map((a) => a.contents)).toEqual(['3.00 m', '6.00 m', '4.50 m²']);
      expect(annotations[1]).toMatchObject({ captionCenter: { x: 0, y: 0 } });
      const viewports = await doc.page(toPageRef(3)).measure!.listViewports();
      expect(viewports).toHaveLength(2);
      expect(viewports[1]).toMatchObject({
        owned: true,
        bbox: { left: -20, bottom: -40, right: 592, top: 752 },
      });
      await doc.page(toPageRef(3)).measure!.setScale(null);
      expect(await doc.page(toPageRef(3)).measure!.listViewports()).toEqual([viewports[0]]);
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
      const created = (await doc.page(toPageRef(3)).annotations.create(draft)).annotation;
      expect(created.contents).toBe('label' in expected && expected.label);
      const saved = await doc.download();
      await doc.close();
      doc = await open(saved);
      const a = (await doc.page(toPageRef(3)).annotations.list()).annotations[0];
      expect(a.contents).toBe(created.contents);
      const changed = await doc
        .page(toPageRef(3))
        .annotations.update(a.ref, { subtype: 'line', color: { r: 0, g: 0, b: 255 } });
      expect(changed.annotation.contents).toBe(created.contents);
    } finally {
      await doc.close();
    }
  });
  test('invalid measure fails before geometry or label writes, unavailable scales keep contents', async () => {
    const doc = await open();
    try {
      const page = doc.page(toPageRef(3)),
        a = (await page.annotations.create(line())).annotation;
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
          captionEnabled: 'invalid',
        } as never),
      ).rejects.toMatchObject({ code: EngineErrorCode.InvalidArg });
      await expect(page.measure!.setScale(undefined as never)).rejects.toMatchObject({
        code: EngineErrorCode.InvalidArg,
      });
      expect(await page.measure!.listViewports()).toEqual([]);
      expect((await page.annotations.list()).annotations[0].contents).toBe('3.00 m');
      const unavailable = await page.annotations.update(a.ref, {
        subtype: 'line',
        measure: { ...scale, y: [{ unit: 'm', conversion: 2 }] },
      });
      expect(unavailable.annotation.contents).toBe('3.00 m');
      expect(measurementReadout(unavailable.annotation)).toEqual({ unavailable: 'no-scale' });
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
            expect(a.captionEnabled).toBe(null);
          const updated = await doc.page(toPageRef(pageObjectNumber)).annotations.update(a.ref, {
            subtype: a.subtype,
            color: { r: 0, g: 0, b: 255 },
          } as never);
          expect(updated.annotation.contents).toBe(a.contents);
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
      // Sending the marker a read returned keeps the foreign measure in place.
      const foreign = before[2].subtype === 'line' ? before[2].measure : null;
      expect(foreign).toEqual({ subtype: 'geospatial' });
      const kept = await page.annotations.update(before[2].ref, {
        subtype: 'line',
        measure: foreign,
        color: { r: 0, g: 0, b: 255 },
      });
      expect(kept.annotation.subtype === 'line' && kept.annotation.measure).toEqual({
        subtype: 'geospatial',
      });
      // Writing a geospatial measure is refused; an explicit scale replaces one.
      await expect(
        page.annotations.update(before[0].ref, {
          subtype: 'line',
          measure: { subtype: 'geospatial' },
        }),
      ).rejects.toMatchObject({ code: EngineErrorCode.InvalidArg });
      const replaced = await page.annotations.update(before[2].ref, {
        subtype: 'line',
        contents: 'corrupt',
        measure: scale,
      });
      expect(replaced.annotation.subtype === 'line' && replaced.annotation.measure?.subtype).toBe(
        'rectilinear',
      );
      expect(replaced.annotation.contents).toBe('3.00 m');
      const after = (await page.annotations.list()).annotations;
      expect(after[0].contents).toBe('3.00 m');
      expect(after[1]).toEqual(before[1]);
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
          intent: 'polygon-dimension',
          measure: scale,
          rect: { left: 10, bottom: 10, right: 110, top: 110 },
          vertices,
          captionEnabled: true,
          captionCenter: { x: 90, y: 20 },
        })
      ).annotation;
      const rotated = vertices.map((p) => ({ x: 200 - p.y, y: p.x }));
      const result = await page.annotations.update(a.ref, {
        subtype: 'polygon',
        vertices: rotated,
        captionEnabled: false,
      });
      expect(result.annotation).toMatchObject({
        contents: '4.50 m²',
        captionEnabled: false,
        captionCenter: { x: 180, y: 90 },
      });
      const explicit = await page.annotations.update(a.ref, {
        subtype: 'polygon',
        vertices,
        captionCenter: { x: 0, y: 0 },
      });
      expect(explicit.annotation).toMatchObject({ captionCenter: { x: 0, y: 0 } });
    } finally {
      await doc.close();
    }
  });
});
