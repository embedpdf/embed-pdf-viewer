/** The annotation shell and the real runtime agree on coordinates, labels and
 * caption offsets through editing and a saved/reopened PDF. */
import { readFile, writeFile } from 'node:fs/promises';
import { describe, expect, test, vi } from 'vitest';
import { drawnPointsOf, measureFromKnownLength, toPageRef } from '@embedpdf/engine-core/runtime';
import { turnPivotOf } from '../../../core/annotation/src';
import { createLocalEngine } from '../src/index';
import { fromDTO, shapeOf } from '../../../core/annotation/src/record';
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
      const pageObjectNumber = page.ref.objectNumber;
      const { ctx, annotation } = await annotationShell(doc, pages);
      cleanups.push(() => ctx.dispose());
      const scale = measureFromKnownLength(100, { value: 5, unit: 'm' });
      await doc.page(toPageRef(pageObjectNumber)).measure!.setScale(scale);
      annotation.setPageViewports(
        page.ref,
        (await doc.page(toPageRef(pageObjectNumber)).measure!.listViewports()).viewports,
        scale,
      );
      for (const tool of annotation.listResolvedTools()) {
        if (tool.defaults) {
          annotation.updateToolDefaults(tool.id, tool.defaults);
        }
      }
      annotation.createPointer('distance', 'down', page.ref, { x: 50, y: 100 });
      annotation.createPointer('distance', 'move', page.ref, { x: 250, y: 100 });
      annotation.createPointer('distance', 'up', page.ref, { x: 250, y: 100 });
      expect(annotation.listSelected()).toHaveLength(0);
      annotation.createPointer('distance', 'move', page.ref, { x: 250, y: 88 });
      annotation.createPointer('distance', 'down', page.ref, { x: 250, y: 88 });
      // Written and confirmed: its ref is the engine's.
      await vi.waitFor(() => expect(annotation.listSelected()[0]?.ref.kind).toBe('objectNumber'));
      const created = annotation.listSelected()[0]!;
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
          start: { x: 50, y: 100 },
          end: { x: 250, y: 100 },
        },
        leader: { length: 12 },
      });
      // The offset handle changes /LL without moving either measured endpoint.
      annotation.editPointer('down', page.ref, { x: 250, y: 88 }, false);
      annotation.editPointer('move', page.ref, { x: 250, y: 64 }, false);
      annotation.editPointer('up', page.ref, { x: 250, y: 64 }, false);
      await vi.waitFor(() =>
        expect(annotation.get(created.ref)).toMatchObject({
          contents: '10.00 m',
          linePoints: created.subtype === 'line' ? created.linePoints : undefined,
          leader: { length: 36 },
        }),
      );
      expectVector();
      // Caption-only drag: +15 along, +25 perpendicular, in the line's own axes (/CO).
      annotation.editPointer('down', page.ref, { x: 150, y: 64 }, false);
      annotation.editPointer('move', page.ref, { x: 165, y: 39 }, false);
      annotation.editPointer('up', page.ref, { x: 165, y: 39 }, false);
      await vi.waitFor(() =>
        expect(annotation.get(created.ref)).toMatchObject({
          captionOffset: { along: 15, perpendicular: 25 },
        }),
      );
      expectVector();
      const newScale = measureFromKnownLength(100, { value: 8, unit: 'ft' });
      await doc.page(toPageRef(pageObjectNumber)).measure!.setScale(newScale);
      const report = await annotation.remeasurePage(page.ref, newScale);
      expect(report.failed).toEqual([]);
      expect(report.error).toBeUndefined();
      expect(annotation.get(created.ref)).toMatchObject({
        contents: '16.00 ft',
        captionOffset: { along: 15, perpendicular: 25 },
      });
      expectVector();

      // A turn pivots about the middle of the line, as the engine turns it,
      // and survives the native appearance echo.
      const beforeRotation = annotation.get(created.ref)!;
      if (beforeRotation.subtype !== 'line') throw new Error('Expected distance annotation');
      const pivot = turnPivotOf(shapeOf(fromDTO(beforeRotation).annotation));
      const start = beforeRotation.linePoints.start;
      const rotatedStart = {
        x: pivot.x - (start.y - pivot.y),
        y: pivot.y + (start.x - pivot.x),
      };
      await annotation.rotateSelectionBy(90);
      await vi.waitFor(() => {
        const rotated = annotation.get(created.ref)!;
        if (rotated.subtype !== 'line') throw new Error('Expected distance annotation');
        // The points stay upright; the turn draws them.
        expect(rotated.rotation).toBe(90);
        expect(rotated.linePoints.start.x).toBeCloseTo(beforeRotation.linePoints.start.x, 3);
        expect(rotated.linePoints.start.y).toBeCloseTo(beforeRotation.linePoints.start.y, 3);
        const drawnStart = drawnPointsOf(rotated)![0]![0]!;
        expect(drawnStart.x).toBeCloseTo(rotatedStart.x, 3);
        expect(drawnStart.y).toBeCloseTo(rotatedStart.y, 3);
        const actual = turnPivotOf(shapeOf(fromDTO(rotated).annotation));
        expect(actual.x).toBeCloseTo(pivot.x, 3);
        expect(actual.y).toBeCloseTo(pivot.y, 3);
      });
      expectVector();
      await annotation.resetSelectionRotation();
      await vi.waitFor(() => {
        const reset = annotation.get(created.ref)!;
        if (reset.subtype !== 'line') throw new Error('Expected distance annotation');
        expect(reset.linePoints.start.x).toBeCloseTo(beforeRotation.linePoints.start.x, 3);
        expect(reset.linePoints.start.y).toBeCloseTo(beforeRotation.linePoints.start.y, 3);
      });
      expectVector();
      await annotation.rotateSelectionBy(90);
      await vi.waitFor(() => {
        const rotated = annotation.get(created.ref)!;
        if (rotated.subtype !== 'line') throw new Error('Expected distance annotation');
        expect(drawnPointsOf(rotated)![0]![0]!.x).toBeCloseTo(rotatedStart.x, 3);
      });

      const saved = await doc.download();
      if (process.env.EMBEDPDF_MEASUREMENT_OUTPUT) {
        await writeFile(`${process.env.EMBEDPDF_MEASUREMENT_OUTPUT}/${prefer}.pdf`, saved);
      }
      const layerBytes = await doc.downloadLayer();
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
          (await layered.page(toPageRef(pageObjectNumber)).measure!.listViewports()).viewports.some(
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
        const reopenedPageObjectNumber = (await reopened.pages.list()).pages[0].ref.objectNumber;
        const list = await reopened.page(toPageRef(reopenedPageObjectNumber)).annotations.list();
        const restored = list.annotations.find((a) => a.nm === created.nm)!;
        expect(restored).toMatchObject({
          intent: 'line-dimension',
          contents: '16.00 ft',
          leader: { length: 36 },
          captionOffset: { along: 15, perpendicular: 25 },
        });
        const restoredPivot = turnPivotOf(shapeOf(fromDTO(restored).annotation));
        expect(restoredPivot.x).toBeCloseTo(pivot.x, 3);
        expect(restoredPivot.y).toBeCloseTo(pivot.y, 3);
        expect(restored.subtype === 'line' && restored.rotation).toBe(90);
        expect(
          (
            await reopened.page(toPageRef(reopenedPageObjectNumber)).measure!.listViewports()
          ).viewports.some((v) => v.owned && v.measure?.subtype === 'rectilinear'),
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
