import type { ConformanceOptions, ConformanceTestRunner } from './runMetadataConformance';
import type { Engine } from '../engine/Engine';
import type { DocumentEvent } from '../events/DocumentEvent';
import type { AnnotationDraft } from '../shared';
import { annotationKey } from '../identity/annotationKey';
import { EngineErrorCode } from '../errors/EngineErrorCode';
import { toPageRef } from '../identity/PageRef';
import { AbortError } from '../promise/AbortError';
import { measureFromKnownLength, measurementReadout } from '../measure';

/** Shared numerical, persistence and calibration contract for local and HTTP engines. */
export function runMeasurementConformance(
  runner: ConformanceTestRunner,
  opts: ConformanceOptions,
): void {
  const { describe, test, beforeAll, afterAll, expect } = runner;
  describe(`measurement conformance: ${opts.label}`, () => {
    let engine: Engine;
    beforeAll(async () => {
      engine = await opts.makeEngine();
    });
    afterAll(async () => {
      await engine?.destroy();
    });
    const open = async () =>
      opts.openKind === 'bytes'
        ? engine.open({ kind: 'bytes', id: opts.fixture.id, bytes: await opts.fixture.bytes() })
        : engine.open({ kind: 'id', id: opts.fixture.cloudId ?? opts.fixture.id });
    const scale = measureFromKnownLength(100, { value: 3, unit: 'm' });
    const rect = { left: 0, bottom: 0, right: 100, top: 100 };
    const vertices = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
    ];

    test('geometry derives contents while caption patches retain placement', async () => {
      const doc = await open();
      try {
        const page = doc.page((await doc.pages.list()).pages[0].ref);
        const created = (
          await page.annotations.create({
            subtype: 'line',
            intent: 'line-dimension',
            rect,
            measure: scale,
            linePoints: { start: vertices[0], end: vertices[1] },
            captionEnabled: true,
            captionOffset: { along: 10, perpendicular: 20 },
          })
        ).annotation;
        const inert = await page.annotations.update(created.ref, {
          subtype: 'line',
          contents: '999 m',
        });
        expect(inert.annotation.contents).toBe('3.00 m');
        expect(inert.appearance).toEqual({ action: 'preserved', changed: false });
        const changed = await page.annotations.update(created.ref, {
          subtype: 'line',
          linePoints: { start: vertices[0], end: { x: 200, y: 0 } },
        });
        expect(changed.annotation.contents).toBe('6.00 m');
        expect(changed.appearance.changed).toBe(true);
        const hidden = await page.annotations.update(created.ref, {
          subtype: 'line',
          captionEnabled: false,
        });
        expect(hidden.annotation).toMatchObject({
          contents: '6.00 m',
          captionEnabled: false,
          captionOffset: { along: 10, perpendicular: 20 },
        });
        expect(hidden.appearance.changed).toBe(true);
        const reset = await page.annotations.update(created.ref, {
          subtype: 'line',
          captionEnabled: true,
          captionOffset: null,
          measure: null,
        });
        expect(reset.annotation.contents).toBe('6.00 m');
        expect(reset.annotation.subtype === 'line' && reset.annotation.captionOffset === null).toBe(
          true,
        );
        expect(measurementReadout(reset.annotation)).toEqual({ unavailable: 'no-measure' });
      } finally {
        await doc.close();
      }
    });

    test('all three kinds derive labels, save, reopen and retain captions', async () => {
      let doc = await open();
      try {
        const pageObjectNumber = (await doc.pages.list()).pages[0].ref.pageObjectNumber;
        const drafts: AnnotationDraft[] = [
          {
            subtype: 'line',
            rect,
            intent: 'line-dimension',
            // Both coordinates and /C cross float32 rounding boundaries.
            measure: measureFromKnownLength(1, { value: 1.00000001, unit: 'm' }),
            contents: 'wrong',
            linePoints: { start: vertices[0], end: { x: 3.4450000001, y: 0 } },
            captionEnabled: true,
            captionOffset: { along: 10, perpendicular: 20 },
          },
          {
            subtype: 'polyline',
            rect,
            intent: 'polyline-dimension',
            measure: scale,
            contents: 'wrong',
            vertices,
            captionEnabled: true,
            captionCenter: { x: 0, y: 0 },
          },
          {
            subtype: 'polygon',
            rect,
            intent: 'polygon-dimension',
            measure: scale,
            contents: 'wrong',
            vertices,
            captionEnabled: true,
            captionCenter: { x: 50, y: 30 },
          },
        ];
        const saved = [];
        for (const draft of drafts) {
          const preview = measurementReadout(draft);
          const a = (await doc.page(toPageRef(pageObjectNumber)).annotations.create(draft))
            .annotation;
          expect(a.contents).toBe('label' in preview ? preview.label : undefined);
          saved.push(a);
        }
        const bytes = opts.openKind === 'bytes' ? await doc.download() : undefined;
        await doc.close();
        doc = bytes
          ? await engine.open({ kind: 'bytes', id: `${opts.fixture.id}-saved`, bytes })
          : await open();
        const page = doc.page((await doc.pages.list()).pages[0].ref);
        const list = (await page.annotations.list()).annotations;
        for (const before of saved) {
          const a = list.find((a) => annotationKey(a.ref) === annotationKey(before.ref))!;
          expect(a.contents).toBe(before.contents);
          if (a.subtype !== 'line' && a.subtype !== 'polygon' && a.subtype !== 'polyline')
            throw new Error('Missing dimension');
          expect(captionOf(a)).toEqual(captionOf(before));
          const result = await page.annotations.update(a.ref, {
            subtype: a.subtype,
            color: { r: 0, g: 0, b: 255 },
          });
          expect(result.annotation.contents).toBe(before.contents);
        }
      } finally {
        await doc.close();
      }
    });

    test('calibration updates only viewports and emits one event per write', async () => {
      const doc = await open();
      try {
        const pageObjectNumber = (await doc.pages.list()).pages[0].ref.pageObjectNumber;
        const page = doc.page(toPageRef(pageObjectNumber));
        if (!page.measure) throw new Error('Measurement service is required');
        const foreign = (await page.measure.listViewports()).filter((v) => !v.owned);
        const annotations = (await page.annotations.list()).annotations;
        const events: DocumentEvent[] = [];
        const off = doc.events.subscribe((event) => events.push(event));
        try {
          await page.measure.setScale(scale);
          expect((await page.measure.listViewports()).filter((v) => v.owned)).toHaveLength(1);
          expect((await page.annotations.list()).annotations).toEqual(annotations);
          await page.measure.setScale(null);
          expect(await page.measure.listViewports()).toEqual(foreign);
          const changes = events.filter((e) => e.type === 'pages.scaleSet');
          expect(changes).toHaveLength(2);
          for (const event of changes)
            expect(event).toMatchObject({
              page: toPageRef(pageObjectNumber),
              meta: { affectedPages: [] },
            });
        } finally {
          off();
        }
      } finally {
        await doc.close();
      }
    });

    test('invalid and immediately aborted calibration leaves the previous scale intact', async () => {
      const doc = await open();
      try {
        const page = doc.page((await doc.pages.list()).pages[0].ref);
        await page.measure!.setScale(scale);
        const before = await page.measure!.listViewports();
        await expect(
          page.measure!.setScale({ ...scale, x: [{ unit: 'm', conversion: 0 }] }),
        ).rejects.toMatchObject({ code: EngineErrorCode.InvalidArg });
        const pending = page.measure!.setScale(null);
        pending.abort('conformance');
        await expect(pending).rejects.toBeInstanceOf(AbortError);
        expect(await page.measure!.listViewports()).toEqual(before);
      } finally {
        await doc.close();
      }
    });
  });
}

const CAPTION_FIELDS = ['captionEnabled', 'captionPosition', 'captionOffset', 'captionCenter'];

/** The caption fields a dimension annotation reads, for comparing two reads. */
function captionOf(annotation: object): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(annotation).filter(([name]) => CAPTION_FIELDS.includes(name)),
  );
}
