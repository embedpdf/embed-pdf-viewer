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

describe('render order (local)', () => {
  test('renders follow the view: on screen before a tile off screen, a high call first', async () => {
    const engine = await createLocalEngine({ runtime: { prefer: 'wasm' } });
    try {
      const doc = await engine.open({
        kind: 'bytes',
        id: 'render-order',
        bytes: CROP_OFFSET_PDF.slice(),
      });
      const { pages } = await doc.pages.list();
      const ref = pages[0]!.ref;
      const stage = doc.with({ view: 'stage' });
      const order: string[] = [];
      const track = (name: string, task: Promise<unknown>) =>
        task.then(() => void order.push(name));
      const viewport = { kind: 'scale', scale: 0.5 } as const;

      // A write takes the worker (a write never gives way, as a running read
      // would to the high call); the renders wait in the queue.
      const running = track('write', doc.metadata.update({ title: 'order' }));
      const below = track(
        'tile below the screen',
        stage.page(ref).render.raw({
          viewport,
          target: { kind: 'rect', rect: { x: 0, y: 150, width: 50, height: 50 } },
        }),
      );
      const base = track('base', stage.page(ref).render.raw({ viewport }));
      const text = track('high text', doc.with({ priority: 'high' }).page(ref).text.layout());
      // The view says what it shows after the renders were asked: they take their places now.
      doc.setWorkingSet('stage', [
        {
          page: ref,
          role: 'visible',
          visible: { x: 0, y: 0, width: 200, height: 100 },
          pixels: 20_000,
        },
      ]);
      await Promise.all([running, below, base, text]);

      expect(order).toEqual(['write', 'high text', 'base', 'tile below the screen']);
      await doc.close();
    } finally {
      await engine.destroy();
    }
  });

  test('with() keeps the facts it was given, adds to them, and gives the same handle for the same facts', async () => {
    const engine = await createLocalEngine({ runtime: { prefer: 'wasm' } });
    try {
      const doc = await engine.open({ kind: 'bytes', id: 'with', bytes: CROP_OFFSET_PDF.slice() });
      const stage = doc.with({ view: 'stage' });
      expect(doc.with({ view: 'stage' })).toBe(stage);
      expect(stage.with({ priority: 'high' })).toBe(doc.with({ priority: 'high', view: 'stage' }));
      expect(stage.id).toBe(doc.id);
      expect(stage.events).toBe(doc.events);
      await doc.close();
      await expect(stage.pages.list()).rejects.toMatchObject({ code: 'DocNotOpen' });
    } finally {
      await engine.destroy();
    }
  });
});
