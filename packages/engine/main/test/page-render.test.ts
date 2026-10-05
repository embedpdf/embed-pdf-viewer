import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import {
  CROP_OFFSET_PDF,
  runPageRenderConformance,
  type ConformanceTestRunner,
} from '@embedpdf/engine-core/conformance';
import {
  pageTransform,
  toPageRef,
  type WirePack,
  type WorkerRequest,
  type WorkerResponse,
} from '@embedpdf/engine-core/runtime';
import { LocalPageRenderService } from '../src/document/LocalPageRenderService';
import { createLocalEngine } from '../src/index';
import type { Transport } from '../src/transport/Transport';
import { WorkerQueue } from '../src/worker/WorkerQueue';

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

describe('render priority (local)', () => {
  test('renders run by priority after the writes asked meanwhile; setPriority re-ranks a waiting one', async () => {
    const engine = await createLocalEngine({ runtime: { prefer: 'wasm' } });
    try {
      const doc = await engine.open({
        kind: 'bytes',
        id: 'render-priority',
        bytes: CROP_OFFSET_PDF.slice(),
      });
      const { pages } = await doc.pages.list();
      const page = doc.page(pages[0]!.ref);
      const order: string[] = [];
      const track = (name: string, task: Promise<unknown>) =>
        task.then(() => void order.push(name));
      const render = (priority?: number) =>
        page.render.raw({ viewport: { kind: 'scale', scale: 0.5 }, priority });

      // The first render takes the worker; the rest wait in the queue.
      const running = track('running', render());
      const low = track('low', render(1));
      const high = track('high', render(5));
      const unranked = track('unranked', render());
      const moved = render(1);
      const write = track('write', doc.metadata.update({ title: 'ranked' }));
      moved.setPriority(9);
      await Promise.all([running, low, high, unranked, track('moved', moved), write]);

      expect(order).toEqual(['running', 'write', 'moved', 'high', 'low', 'unranked']);
      await doc.close();
    } finally {
      await engine.destroy();
    }
  });

  test('the worker hears the priority a render has when it is sent, for its own line', async () => {
    const sent: WorkerRequest[] = [];
    let answer: (response: WorkerResponse) => void = () => undefined;
    const transport: Transport = {
      send: (pack: WirePack<WorkerRequest>) => void sent.push(pack.payload),
      onMessage: (handler) => {
        answer = handler;
        return () => undefined;
      },
      terminate: async () => undefined,
    };
    const render = new LocalPageRenderService(
      'doc',
      toPageRef(3),
      new WorkerQueue(transport),
      { isClosed: () => false },
      {} as never,
      { assertCapability: () => undefined } as never,
    );
    const options = { viewport: { kind: 'scale', scale: 1 } } as const;
    const running = render.raw(options); // sent at once: the queue's one slot
    const waiting = render.raw({ ...options, priority: 2 });
    waiting.setPriority(7);
    expect(sent).toEqual([expect.objectContaining({ options: { ...options, priority: 0 } })]);

    // The slot frees; the waiting render goes out with its priority now.
    answer({ kind: 'reject', jobId: sent[0]!.jobId, error: { code: 'Aborted', message: '' } });
    await running.catch(() => undefined);
    expect(sent[1]).toMatchObject({ kind: 'pages.render', options: { priority: 7 } });
    answer({ kind: 'reject', jobId: sent[1]!.jobId, error: { code: 'Aborted', message: '' } });
    await waiting.catch(() => undefined);
  });
});
