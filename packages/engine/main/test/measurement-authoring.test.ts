/** The annotation shell and the real runtime agree on coordinates, labels and
 * caption offsets through editing and a saved/reopened PDF. */
import { readFile, writeFile } from 'node:fs/promises';
import { describe, expect, test, vi } from 'vitest';
import type { PluginContext } from '@embedpdf/core';
import { measureFromKnownLength } from '@embedpdf/engine-core/runtime';
import { createLocalEngine } from '../src/index';
import { createAnnotationCapability } from '../../../plugin/annotation/src/capability';
import { annotationReducer, initialAnnotationState } from '../../../plugin/annotation/src/reducer';
import type { AnnotationAction, AnnotationState } from '../../../plugin/annotation/src/types';

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
      const pages = (await doc.pages.list()).pages,
        page = pages[0],
        pon = page.pageObjectNumber;
      let state = initialAnnotationState();
      const ctx = {
        doc,
        engine,
        document: () => ({ pages }),
        getState: () => state,
        dispatch: (a: AnnotationAction) => {
          state = annotationReducer(state, a);
        },
        cleanup: (cb: () => void) => cleanups.push(cb),
        tryGet: () => null,
      } as unknown as PluginContext<AnnotationState, AnnotationAction>;
      const annotation = createAnnotationCapability(ctx);
      const scale = measureFromKnownLength(100, { value: 5, unit: 'm' });
      await doc.page(pon).measure!.setScale(scale);
      annotation.setPageViewports(pon, await doc.page(pon).measure!.viewports(), scale);
      for (const tool of annotation.tools())
        if (tool.defaults) annotation.setDefaults(tool.preset, tool.defaults);
      annotation.createPointer('distance', 'down', pon, { x: 50, y: 100 });
      annotation.createPointer('distance', 'move', pon, { x: 250, y: 100 });
      annotation.createPointer('distance', 'up', pon, { x: 250, y: 100 });
      await vi.waitFor(() => expect(annotation.getSelected()).toHaveLength(1));
      const created = annotation.getSelected()[0];
      expect(created).toMatchObject({
        subtype: 'line',
        intent: 'LineDimension',
        contents: '10 m',
        linePoints: {
          start: { x: page.boxes.crop.left + 50, y: page.boxes.crop.top - 100 },
          end: { x: page.boxes.crop.left + 250, y: page.boxes.crop.top - 100 },
        },
      });
      // Caption-only drag: +15 along, +25 perpendicular in PDF y-up axes.
      annotation.editPointer('down', pon, { x: 150, y: 88 }, false);
      annotation.editPointer('move', pon, { x: 165, y: 63 }, false);
      annotation.editPointer('up', pon, { x: 165, y: 63 }, false);
      await vi.waitFor(() =>
        expect(annotation.get(created.ref)).toMatchObject({
          caption: { offset: { along: 15, perpendicular: 25 } },
        }),
      );
      const newScale = measureFromKnownLength(100, { value: 8, unit: 'ft' });
      await doc.page(pon).measure!.setScale(newScale);
      const report = await annotation.remeasurePage(pon, newScale);
      expect(report.failed).toEqual([]);
      expect(report.error).toBeUndefined();
      expect(annotation.get(created.ref)).toMatchObject({
        contents: '16 ft',
        caption: { offset: { along: 15, perpendicular: 25 } },
      });
      const saved = await doc.download();
      if (process.env.EMBEDPDF_MEASUREMENT_OUTPUT) await writeFile(`${process.env.EMBEDPDF_MEASUREMENT_OUTPUT}/${prefer}.pdf`, saved);
      const layerBytes = await doc.downloadLayer!();
      const layered = await engine.open({ kind: 'layerBytes', id: `authoring-layer-${prefer}`, baseBytes: bytes, layer: { kind: 'artifact', bytes: layerBytes } }, { scope: ['*'] });
      try {
        const layeredAnnotations = (await layered.page(pon).annotations.list()).annotations;
        expect(layeredAnnotations.find(a => a.nm === created.nm)).toMatchObject({ contents: '16 ft', caption: { offset: { along: 15, perpendicular: 25 } } });
        expect((await layered.page(pon).measure!.viewports()).some(v => v.owned)).toBe(true);
      } finally { await layered.close(); }
      const reopened = await engine.open(
        { kind: 'bytes', id: `authoring-reopened-${prefer}`, bytes: saved },
        { scope: ['*'] },
      );
      try {
        const reopenedPon = (await reopened.pages.list()).pages[0].pageObjectNumber;
        const list = await reopened.page(reopenedPon).annotations.list();
        expect(list.annotations.find((a) => a.nm === created.nm)).toMatchObject({
          intent: 'LineDimension',
          contents: '16 ft',
          caption: { offset: { along: 15, perpendicular: 25 } },
        });
        expect(
          (await reopened.page(reopenedPon).measure!.viewports()).some(
            (v) => v.owned && v.measure?.subtype === 'RL',
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
