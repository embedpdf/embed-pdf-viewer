/** Exercise the editor/engine seam against both runtimes, including saved PDF
 *  and layer replay. A label move must never rewrite the measured vertices. */
import { readFile, writeFile } from 'node:fs/promises';
import { describe, expect, test, vi } from 'vitest';
import { measureFromKnownLength, toPageRef } from '@embedpdf/engine-core/runtime';
import { annotationSelectionFrame, shapeMeasurementLayout } from '../../../core/annotation/src';
import { rotatePoint } from '../../../core/annotation/src/geometry';
import { createLocalEngine } from '../src/index';
import { fromDTO } from '../../../plugin/annotation/src/repository';
import { annotationKey } from '@embedpdf/engine-core/runtime';
import { annotationShell } from './helpers/annotation-shell';

describe.each(['wasm', 'native'] as const)('shape authoring integration (%s)', (prefer) => {
  test.each(['area', 'perimeter'])(
    '%s: draw, move label, edit, rotate, reset, save and replay',
    async (tool) => {
      const engine = await createLocalEngine({ runtime: { prefer } });
      const bytes = new Uint8Array(
        await readFile(new URL('./fixtures/measure-acrobat-metric.pdf', import.meta.url)),
      );
      const doc = await engine.open(
        {
          kind: 'layerBytes',
          id: `shape-${tool}-${prefer}`,
          baseBytes: bytes,
          layer: { kind: 'fresh' },
        },
        { scope: ['*'] },
      );
      const cleanups: Array<() => void | Promise<void>> = [];
      try {
        const pages = (await doc.pages.list()).pages;
        const page = pages[0];
        const pageObjectNumber = page.ref.pageObjectNumber;
        const crop = page.boxes.crop;
        const { ctx, annotation } = await annotationShell(doc, pages);
        cleanups.push(() => ctx.dispose());
        const scale = measureFromKnownLength(100, { value: 5, unit: 'm' });
        await doc.page(toPageRef(pageObjectNumber)).measure!.setScale(scale);
        annotation.setPageViewports(
          page.ref,
          await doc.page(toPageRef(pageObjectNumber)).measure!.viewports(),
          scale,
        );
        for (const preset of annotation.listResolvedTools()) {
          if (preset.defaults) annotation.setToolDefaults(preset.id, preset.defaults);
        }
        for (const point of [
          { x: 100, y: 300 },
          { x: 300, y: 300 },
          { x: 300, y: 400 },
          { x: 100, y: 400 },
        ]) {
          annotation.createPointer(tool, 'down', page.ref, point);
        }
        void annotation.finishCreationDraft();
        await vi.waitFor(() => expect(annotation.listSelected()).toHaveLength(1));
        const created = annotation.listSelected()[0].raw!;
        if (created.subtype !== 'polygon' && created.subtype !== 'polyline')
          throw new Error('Expected shape');
        const current = () => {
          const dto = annotation.getRaw(created.ref)!;
          if (dto.subtype !== 'polygon' && dto.subtype !== 'polyline')
            throw new Error('Expected shape');
          return dto;
        };
        const expectVector = () => {
          expect(
            annotation
              .listPageItems(page.ref)
              .find((item) => item.id === annotationKey(created.ref))?.source,
          ).toBe('vector');
          // The fixture's own annotations render baked; the edited shape never does.
          const bakedEntries = annotation.getAppearanceEpoch(page.ref).split('|');
          const createdKey = annotationKey(created.ref);
          expect(bakedEntries.some((entry) => entry.startsWith(`${createdKey}@`))).toBe(false);
        };
        expect(created.contents).toBe(tool === 'area' ? '50 m²' : '25 m');
        expect(created.caption).toEqual({ enabled: true });
        const model = fromDTO(created, crop);
        if (!model.measure || model.measure.intent === 'LineDimension')
          throw new Error('Expected shape measure');
        const label = shapeMeasurementLayout(model.geometry, model.measure, model.style)!.caption!
          .center;
        const target = { x: 390, y: 275 };
        annotation.editPointer('down', page.ref, label, false);
        annotation.editPointer('move', page.ref, target, false);
        annotation.editPointer('up', page.ref, target, false);
        await vi.waitFor(() =>
          expect(current().caption?.center).toEqual({
            x: crop.left + target.x,
            y: crop.top - target.y,
          }),
        );
        expect(current().vertices).toEqual(created.vertices);
        expectVector();

        // The manual center stays put when only one measured vertex changes.
        annotation.editPointer('down', page.ref, { x: 100, y: 300 }, false);
        annotation.editPointer('move', page.ref, { x: 80, y: 290 }, false);
        annotation.editPointer('up', page.ref, { x: 80, y: 290 }, false);
        await vi.waitFor(() => expect(current().vertices[0].x).toBeCloseTo(crop.left + 80, 3));
        expect(current().caption?.center).toEqual({
          x: crop.left + target.x,
          y: crop.top - target.y,
        });
        expectVector();

        const before = current();
        const frame = annotationSelectionFrame(fromDTO(before, crop));
        const rotatedCaption = rotatePoint(target, frame.center, 90);
        await annotation.rotateSelectionBy(90);
        await vi.waitFor(() => {
          expect(current().rotation).toBe(270);
          expect(current().caption?.center?.x).toBeCloseTo(crop.left + rotatedCaption.x, 3);
          expect(current().caption?.center?.y).toBeCloseTo(crop.top - rotatedCaption.y, 3);
          const after = annotationSelectionFrame(fromDTO(current(), crop));
          expect(after.center.x).toBeCloseTo(frame.center.x, 3);
          expect(after.center.y).toBeCloseTo(frame.center.y, 3);
        });
        expectVector();
        const displacedRect = current().rect;
        await annotation.updateRaw(created.ref, {
          subtype: created.subtype,
          caption: { center: null },
        });
        expect(current().caption?.center).toBeUndefined();
        expect(current().rect.top - current().rect.bottom).toBeLessThan(
          displacedRect.top - displacedRect.bottom,
        );
        expectVector();
        const final = current();
        const saved = await doc.download();
        if (process.env.EMBEDPDF_MEASUREMENT_OUTPUT) {
          await writeFile(
            `${process.env.EMBEDPDF_MEASUREMENT_OUTPUT}/${tool}-${prefer}.pdf`,
            saved,
          );
        }
        const layer = await doc.downloadLayer!();
        for (const source of [
          { kind: 'bytes' as const, id: `saved-${tool}-${prefer}`, bytes: saved },
          {
            kind: 'layerBytes' as const,
            id: `layer-${tool}-${prefer}`,
            baseBytes: bytes,
            layer: { kind: 'artifact' as const, bytes: layer },
          },
        ]) {
          const reopened = await engine.open(source, { scope: ['*'] });
          try {
            const reopenedPageObjectNumber = (await reopened.pages.list()).pages[0].ref
              .pageObjectNumber;
            const list = (
              await reopened.page(toPageRef(reopenedPageObjectNumber)).annotations.list()
            ).annotations;
            const restored = list.find((dto) => dto.nm === created.nm)!;
            expect(restored).toMatchObject({
              subtype: final.subtype,
              intent: final.intent,
              vertices: final.vertices,
              contents: final.contents,
              caption: { enabled: true },
              rotation: 270,
            });
            const restoredModel = fromDTO(restored, crop);
            expect(annotationSelectionFrame(restoredModel)).toEqual(
              annotationSelectionFrame(fromDTO(final, crop)),
            );
            // Rendering requests exercise the generated /AP as well as dictionary persistence.
            const appearance = await reopened
              .page(toPageRef(reopenedPageObjectNumber))
              .annotations.renderAppearances({ scale: 1 });
            expect(appearance).toBeTruthy();
          } finally {
            await reopened.close();
          }
        }
      } finally {
        for (const cleanup of cleanups.reverse()) await cleanup();
        await doc.close();
        await engine.destroy();
      }
    },
  );
});
