/** The annotation shell and the real runtime agree on coordinates, labels and
 * caption offsets through editing and a saved/reopened PDF. */
import { readFile, writeFile } from 'node:fs/promises';
import { describe, expect, test, vi } from 'vitest';
import { measureFromKnownLength, toPageRef } from '@embedpdf/engine-core/runtime';
import { annotationSelectionFrame } from '../../../core/annotation/src';
import { createLocalEngine } from '../src/index';
import { fromDTO } from '../../../plugin/annotation/src/repository';
import { annotationKey } from '@embedpdf/engine-core/runtime';
import { annotationShell } from './helpers/annotation-shell';

describe.each(['wasm', 'native'] as const)('distance authoring integration (%s)', (prefer) => {
  test('draw, edit, recalculate, save and reopen', async () => {
    const engine = await createLocalEngine({ runtime: { prefer } });
    const bytes = new Uint8Array(
      await readFile(new URL('./fixtures/measure-acrobat-metric.pdf', import.meta.url)),
    );
    const doc = await engine.open(
      { kind: 'layerBytes', id: `authoring-${prefer}`, baseBytes: bytes, layer: { kind: 'fresh' } },
      { scope: ['*'] },
    );
    const cleanups: Array<() => void | Promise<void>> = [];
    try {
      const pages = (await doc.pages.list()).pages;
      const page = pages[0];
      const pageObjectNumber = page.ref.pageObjectNumber;
      const { ctx, annotation } = await annotationShell(doc, pages);
      cleanups.push(() => ctx.dispose());
      const scale = measureFromKnownLength(100, { value: 5, unit: 'm' });
      await doc.page(toPageRef(pageObjectNumber)).measure!.setScale(scale);
      annotation.setPageViewports(
        page.ref,
        await doc.page(toPageRef(pageObjectNumber)).measure!.listViewports(),
        scale,
      );
      for (const tool of annotation.listResolvedTools()) {
        if (tool.defaults) {
          annotation.setToolDefaults(tool.id, tool.defaults);
        }
      }
      annotation.createPointer('distance', 'down', page.ref, { x: 50, y: 100 });
      annotation.createPointer('distance', 'move', page.ref, { x: 250, y: 100 });
      annotation.createPointer('distance', 'up', page.ref, { x: 250, y: 100 });
      expect(annotation.listSelected()).toHaveLength(0);
      annotation.createPointer('distance', 'move', page.ref, { x: 250, y: 88 });
      annotation.createPointer('distance', 'down', page.ref, { x: 250, y: 88 });
      await vi.waitFor(() => expect(annotation.listSelected()).toHaveLength(1));
      const created = annotation.listSelected()[0].raw!;
      const createdId = annotationKey(created.ref);
      const expectVector = () => {
        expect(
          annotation.listPageItems(page.ref).find((item) => item.id === createdId),
        ).toMatchObject({
          source: 'vector',
          ref: created.ref,
        });
        const bakedEntries = annotation.getAppearanceEpoch(page.ref).split('|');
        expect(bakedEntries.some((entry) => entry.startsWith(`${createdId}@`))).toBe(false);
      };
      expectVector();
      expect(created).toMatchObject({
        subtype: 'line',
        intent: 'line-dimension',
        contents: '10.00 m',
        linePoints: {
          start: { x: page.boxes.crop.left + 50, y: page.boxes.crop.top - 100 },
          end: { x: page.boxes.crop.left + 250, y: page.boxes.crop.top - 100 },
        },
        leader: { length: 12 },
      });
      // The offset handle changes /LL without moving either measured endpoint.
      annotation.editPointer('down', page.ref, { x: 250, y: 88 }, false);
      annotation.editPointer('move', page.ref, { x: 250, y: 64 }, false);
      annotation.editPointer('up', page.ref, { x: 250, y: 64 }, false);
      await vi.waitFor(() =>
        expect(annotation.getRaw(created.ref)).toMatchObject({
          contents: '10.00 m',
          linePoints: created.subtype === 'line' ? created.linePoints : undefined,
          leader: { length: 36 },
        }),
      );
      expectVector();
      // Caption-only drag: +15 along, +25 perpendicular in PDF y-up axes.
      annotation.editPointer('down', page.ref, { x: 150, y: 64 }, false);
      annotation.editPointer('move', page.ref, { x: 165, y: 39 }, false);
      annotation.editPointer('up', page.ref, { x: 165, y: 39 }, false);
      await vi.waitFor(() =>
        expect(annotation.getRaw(created.ref)).toMatchObject({
          captionOffset: { along: 15, perpendicular: 25 },
        }),
      );
      expectVector();
      const newScale = measureFromKnownLength(100, { value: 8, unit: 'ft' });
      await doc.page(toPageRef(pageObjectNumber)).measure!.setScale(newScale);
      const report = await annotation.remeasurePage(page.ref, newScale);
      expect(report.failed).toEqual([]);
      expect(report.error).toBeUndefined();
      expect(annotation.getRaw(created.ref)).toMatchObject({
        contents: '16.00 ft',
        captionOffset: { along: 15, perpendicular: 25 },
      });
      expectVector();

      // Rotation uses the complete annotation frame and survives the native
      // appearance echo without replacing that frame with the PDF /Rect.
      const beforeRotation = annotation.getRaw(created.ref)!;
      if (beforeRotation.subtype !== 'line') throw new Error('Expected distance annotation');
      const frame = annotationSelectionFrame(fromDTO(beforeRotation, page.boxes.crop));
      const start = {
        x: beforeRotation.linePoints.start.x - page.boxes.crop.left,
        y: page.boxes.crop.top - beforeRotation.linePoints.start.y,
      };
      const rotatedStart = {
        x: page.boxes.crop.left + frame.center.x - (start.y - frame.center.y),
        y: page.boxes.crop.top - (frame.center.y + start.x - frame.center.x),
      };
      await annotation.rotateSelectionBy(90);
      await vi.waitFor(() => {
        const rotated = annotation.getRaw(created.ref)!;
        if (rotated.subtype !== 'line') throw new Error('Expected distance annotation');
        expect(rotated.linePoints.start.x).toBeCloseTo(rotatedStart.x, 3);
        expect(rotated.linePoints.start.y).toBeCloseTo(rotatedStart.y, 3);
        const actual = annotationSelectionFrame(fromDTO(rotated, page.boxes.crop));
        expect(actual.center.x).toBeCloseTo(frame.center.x, 3);
        expect(actual.center.y).toBeCloseTo(frame.center.y, 3);
      });
      expectVector();
      await annotation.resetSelectionRotation();
      await vi.waitFor(() => {
        const reset = annotation.getRaw(created.ref)!;
        if (reset.subtype !== 'line') throw new Error('Expected distance annotation');
        expect(reset.linePoints.start.x).toBeCloseTo(beforeRotation.linePoints.start.x, 3);
        expect(reset.linePoints.start.y).toBeCloseTo(beforeRotation.linePoints.start.y, 3);
      });
      expectVector();
      await annotation.rotateSelectionBy(90);
      await vi.waitFor(() => {
        const rotated = annotation.getRaw(created.ref)!;
        if (rotated.subtype !== 'line') throw new Error('Expected distance annotation');
        expect(rotated.linePoints.start.x).toBeCloseTo(rotatedStart.x, 3);
      });

      const saved = await doc.download();
      if (process.env.EMBEDPDF_MEASUREMENT_OUTPUT) {
        await writeFile(`${process.env.EMBEDPDF_MEASUREMENT_OUTPUT}/${prefer}.pdf`, saved);
      }
      const layerBytes = await doc.downloadLayer!();
      const layered = await engine.open(
        {
          kind: 'layerBytes',
          id: `authoring-layer-${prefer}`,
          baseBytes: bytes,
          layer: { kind: 'artifact', bytes: layerBytes },
        },
        { scope: ['*'] },
      );
      try {
        const layeredAnnotations = (
          await layered.page(toPageRef(pageObjectNumber)).annotations.list()
        ).annotations;
        expect(layeredAnnotations.find((a) => a.nm === created.nm)).toMatchObject({
          contents: '16.00 ft',
          leader: { length: 36 },
          captionOffset: { along: 15, perpendicular: 25 },
        });
        expect(
          (await layered.page(toPageRef(pageObjectNumber)).measure!.listViewports()).some(
            (v) => v.owned,
          ),
        ).toBe(true);
      } finally {
        await layered.close();
      }
      const reopened = await engine.open(
        { kind: 'bytes', id: `authoring-reopened-${prefer}`, bytes: saved },
        { scope: ['*'] },
      );
      try {
        const reopenedPageObjectNumber = (await reopened.pages.list()).pages[0].ref
          .pageObjectNumber;
        const list = await reopened.page(toPageRef(reopenedPageObjectNumber)).annotations.list();
        const restored = list.annotations.find((a) => a.nm === created.nm)!;
        expect(restored).toMatchObject({
          intent: 'line-dimension',
          contents: '16.00 ft',
          leader: { length: 36 },
          captionOffset: { along: 15, perpendicular: 25 },
        });
        const restoredFrame = annotationSelectionFrame(fromDTO(restored, page.boxes.crop));
        expect(restoredFrame.center.x).toBeCloseTo(frame.center.x, 3);
        expect(restoredFrame.center.y).toBeCloseTo(frame.center.y, 3);
        expect(restoredFrame.angle).toBe(90);
        expect(
          (await reopened.page(toPageRef(reopenedPageObjectNumber)).measure!.listViewports()).some(
            (v) => v.owned && v.measure?.subtype === 'rectilinear',
          ),
        ).toBe(true);
      } finally {
        await reopened.close();
      }
    } finally {
      for (const cleanup of cleanups) await cleanup();
      await doc.close();
      await engine.destroy();
    }
  }, 30000);
});
