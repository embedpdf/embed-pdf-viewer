import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import {
  CROP_OFFSET_PDF,
  runPageRenderConformance,
  type ConformanceTestRunner,
} from '@embedpdf/engine-core/conformance';
import { pageTransform } from '@embedpdf/engine-core/runtime';
import { createLocalEngine } from '../src/index';

const runner: ConformanceTestRunner = {
  describe,
  test,
  beforeAll,
  afterAll,
  expect: expect as unknown as ConformanceTestRunner['expect'],
};

runPageRenderConformance(runner, {
  label: 'engine-local (inline transport, wasm runtime)',
  makeEngine: () => createLocalEngine({ runtime: { prefer: 'wasm' } }),
  open: (engine) =>
    engine.open({ kind: 'bytes', id: 'crop-offset-render', bytes: CROP_OFFSET_PDF.slice() }),
});

describe('render.raw() (local)', () => {
  test('a raster carries the transform an image with the same settings has', async () => {
    const engine = await createLocalEngine({ runtime: { prefer: 'wasm' } });
    try {
      const doc = await engine.open({
        kind: 'bytes',
        id: 'crop-offset-raw',
        bytes: CROP_OFFSET_PDF.slice(),
      });
      const { pages } = await doc.pages.list();
      const page = doc.page(pages[0]!.ref);
      const options = {
        target: { kind: 'rect', rect: { x: 50, y: 150, width: 200, height: 160 } },
        viewport: { kind: 'width', width: 100 },
        rotation: 270,
      } as const;
      const raster = await page.render.raw(options);
      const image = await page.render.image({ format: 'png', ...options });
      expect([raster.transform.width, raster.transform.height]).toEqual([
        raster.width,
        raster.height,
      ]);
      expect(raster.transform.matrix).toEqual(image.transform.matrix);
      expect(raster.transform.matrix).toEqual(pageTransform(pages[0]!, options).matrix);
      // The square's middle is dark where the transform puts it.
      const { x, y } = raster.transform.pageToPixels({ x: 150, y: 250 });
      const at = (Math.floor(y) * raster.width + Math.floor(x)) * 4;
      const rgba = new Uint8Array(raster.data, at, 3);
      expect(Math.max(...rgba)).toBeLessThan(60);
      await doc.close();
    } finally {
      await engine.destroy();
    }
  });
});
